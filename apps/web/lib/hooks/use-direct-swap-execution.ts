"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  OrderStatus,
  SpotError,
  type Order,
  type PreparedSwap,
  type RePermitOrder,
} from "@orbs-network/spot-react";
import { createHostSwapExecution, OrderSettlementError, type OrderWalletInteractions, type OrderExecutionUpdate } from "@orbs-network/spot-react/internal";
import { getConnection } from "wagmi/actions";
import { wagmiConfig } from "../wagmi-config";
import { useSwapStore } from "./store";
import { createSwapWalletAdapter } from "../create-swap-wallet-adapter";
import { idleSwapExecution, useDirectSwapStore, type DirectSwapPhase, type DirectSwapState, type SwapReview } from "../swap-execution-store";

export type { DirectSwapPhase, SwapReview, SwapReviewContext } from "../swap-execution-store";
const activePhases = new Set<DirectSwapPhase>(["preparing", "wrapping", "approving", "signing", "settling"]);
const normalizeError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error));

/** Match every signed field when reconciling a POST whose response was lost. */
export const matchesSignedSwap = (expected: unknown, actual: unknown): boolean => {
  if (expected !== null && typeof expected === "object") {
    return actual !== null && typeof actual === "object" &&
      Object.entries(expected).every(([key, value]) => matchesSignedSwap(value, Reflect.get(actual, key)));
  }
  const integer = (value: unknown): bigint | undefined => {
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
    return undefined;
  };
  const left = integer(expected);
  const right = integer(actual);
  if (left !== undefined || right !== undefined) return left !== undefined && left === right;
  if (typeof expected === "string" && typeof actual === "string" && /^0x/i.test(expected)) {
    return expected.toLowerCase() === actual.toLowerCase();
  }
  return expected === actual;
};

/** The DEX owns wallet steps and status tracking; the SDK prepares and submits signed orders. */
export const useDirectSwapExecution = ({ contextKey, walletInteractions, refreshBalances }: {
  contextKey: string;
  walletInteractions: OrderWalletInteractions;
  refreshBalances: (addresses: string[]) => Promise<unknown>;
}) => {
  const state = useDirectSwapStore(store => store.execution);
  const confirmedWrap = useDirectSwapStore(store => store.confirmedWrap);
  const scope = useRef(contextKey);
  const ownedController = useRef<AbortController | undefined>(undefined);
  const publish = useCallback((value: DirectSwapState) => {
    useDirectSwapStore.setState({ execution: value });
  }, []);

  useEffect(() => {
    scope.current = contextKey;
    const saved = useDirectSwapStore.getState();
    if (saved.execution.review?.contextKey !== contextKey && saved.execution.phase !== "settling") {
      saved.controller?.abort(new Error("The wallet or reviewed swap changed. Review the swap again."));
    }
  }, [contextKey]);
  useEffect(() => {
    return () => { ownedController.current?.abort(); };
  }, []);

  const execute = useCallback(async (currentReview: SwapReview): Promise<void> => {
    const saved = useDirectSwapStore.getState();
    if (saved.controller || saved.execution.phase === "unconfirmed") return;
    const review: SwapReview = {
      ...currentReview,
      quote: structuredClone(currentReview.quote),
      inputToken: { ...currentReview.inputToken },
      outputToken: { ...currentReview.outputToken },
    };
    const abort = new AbortController();
    ownedController.current = abort;
    useDirectSwapStore.setState({ controller: abort });
    let execution: DirectSwapState = { ...idleSwapExecution(), phase: "preparing", review };
    let submissionStarted = false;
    const update = (changes: Partial<DirectSwapState>) => {
      if (useDirectSwapStore.getState().controller !== abort) return;
      execution = { ...execution, ...changes };
      publish(execution);
    };
    const check = () => {
      abort.signal.throwIfAborted();
      if (useDirectSwapStore.getState().controller !== abort) throw new Error("This swap attempt is no longer active.");
      // Accepted orders track independently of later wallet/form changes.
      if (execution.hostExecution?.order) return;
      const connection = getConnection(wagmiConfig);
      if (scope.current !== review.contextKey ||
        useSwapStore.getState().inputAmount !== review.inputAmountUi ||
        connection.chainId !== review.client.chainId ||
        connection.address?.toLowerCase() !== review.account.toLowerCase()) {
        abort.abort(new Error("The wallet or reviewed swap changed. Review the swap again."));
        abort.signal.throwIfAborted();
      }
    };
    update({});
    try {
      check();
      const previousWrap = saved.confirmedWrap;
      const hasConfirmedWrap = previousWrap?.account === review.account.toLowerCase() &&
        previousWrap.chainId === review.client.chainId &&
        previousWrap.tokenAddress === review.quote.request.inToken.toLowerCase();
      const isPriceRetry = saved.execution.phase === "price-changed" &&
        saved.execution.review?.contextKey === review.contextKey;
      const reuseConfirmedWrap = hasConfirmedWrap && isPriceRetry &&
        previousWrap.contextKey === review.contextKey && previousWrap.amountRaw === review.quote.request.inAmount &&
        saved.execution.wrapTxHash === previousWrap.hash;
      if (hasConfirmedWrap) update({ wrapTxHash: previousWrap.hash });
      if (isPriceRetry) update({ approvalTxHash: saved.execution.approvalTxHash });
      const wallet = createSwapWalletAdapter({
        wallet: reuseConfirmedWrap ? { ...walletInteractions, shouldWrap: () => false } : walletInteractions,
        guard: check, hasConfirmedWrap: Boolean(hasConfirmedWrap),
        onWrapConfirmed: (hash, amountRaw) => {
          useDirectSwapStore.setState({ confirmedWrap: {
            account: review.account.toLowerCase(), chainId: review.client.chainId,
            tokenAddress: review.quote.request.inToken.toLowerCase(), hash, contextKey: review.contextKey, amountRaw,
          } });
          update({ wrapTxHash: hash });
          void refreshBalances([review.quote.request.inToken]).catch(() => undefined);
        },
        onApproveConfirmed: hash => { update({ approvalTxHash: hash }); },
      });
      const onProgress = (progress: OrderExecutionUpdate<PreparedSwap>): void => {
        if (useDirectSwapStore.getState().controller !== abort) return;
        if (progress.phase === "submitting") submissionStarted = true;
        const phase = progress.phase === "submitting" ? "settling" : progress.phase;
        update({
          phase,
          steps: [...progress.steps], stepIndex: progress.stepIndex,
          wrapTxHash: progress.wrapTxHash ?? execution.wrapTxHash, approvalTxHash: progress.approvalTxHash ?? execution.approvalTxHash,
          ...(progress.preparedOrder ? { signedOrder: structuredClone(progress.preparedOrder.order) as RePermitOrder } : {}),
          ...(progress.order ? { order: structuredClone(progress.order) as Order } : {}),
        });
      };
      const hostExecution = createHostSwapExecution(review.client, {
        quote: review.quote, account: review.account, walletInteractions: wallet,
        signal: abort.signal,
      });
      update({ hostExecution });
      const order = await hostExecution.run({ onProgress });
      update({ phase: "success", order });
      useDirectSwapStore.setState({ confirmedWrap: undefined });
      void refreshBalances([review.quote.request.inToken]).catch(() => undefined);
    } catch (cause) {
      if (cause instanceof SpotError && cause.code === "QUOTE_MINIMUM_DECREASED" &&
        !submissionStarted && !execution.hostExecution?.preparedOrder && !execution.hostExecution?.order && !abort.signal.aborted) {
        update({
          phase: "price-changed", priceChangedAt: Date.now(), error: undefined,
          hostExecution: undefined, signedOrder: undefined, order: undefined, steps: [], stepIndex: 0,
        });
        return;
      }
      const error = normalizeError(cause);
      const settlement = cause instanceof OrderSettlementError ? cause : undefined;
      const terminal = settlement?.reason === "cancelled" || settlement?.reason === "expired";
      const rejectedSubmission = cause instanceof SpotError && cause.code === "SUBMISSION_FAILED" &&
        typeof cause.status === "number" && cause.status < 500 && cause.status !== 408 && !cause.cause;
      // The SDK wraps in-flight POST aborts; only its preflight check returns this exact reason.
      const preflightAbort = abort.signal.aborted && cause === abort.signal.reason;
      const expiredBeforeSubmission = cause instanceof SpotError && cause.code === "ORDER_EXPIRED";
      update({
        phase: !terminal && !rejectedSubmission && !preflightAbort && !expiredBeforeSubmission && (settlement || submissionStarted) ? "unconfirmed" : "failed",
        error,
        ...(settlement?.order ? { order: settlement.order } : {}),
      });
    } finally {
      abort.abort();
      if (useDirectSwapStore.getState().controller === abort) useDirectSwapStore.setState({ controller: undefined });
      if (ownedController.current === abort) ownedController.current = undefined;
    }
  }, [publish, refreshBalances, walletInteractions]);

  const checkOrderStatus = useCallback(async (): Promise<void> => {
    const host = useDirectSwapStore.getState();
    const saved = host.execution;
    if (host.controller || saved.phase !== "unconfirmed" || !saved.review) return;
    const abort = new AbortController();
    ownedController.current = abort;
    useDirectSwapStore.setState({ controller: abort });
    publish({ ...saved, phase: "settling", error: undefined });
    try {
      const { client, account } = saved.review;
      const signedOrder = saved.signedOrder ?? saved.hostExecution?.preparedOrder?.order;
      const acceptedOrder = saved.order ?? saved.hostExecution?.order;
      const order = acceptedOrder
        ? await client.getOrder({ orderId: acceptedOrder.id, signal: abort.signal })
        : signedOrder
          ? (await client.getOrders({ account, legacyOrders: false, getv1orders: false, rejectInvalidOrders: true, signal: abort.signal })).orders.find(candidate =>
            candidate.version === 2 && "order" in candidate.rawOrder && matchesSignedSwap(signedOrder, candidate.rawOrder.order))
          : undefined;
      abort.signal.throwIfAborted();
      if (!order) {
        const deadline = signedOrder?.deadline;
        if (!acceptedOrder && typeof deadline === "string" && /^\d+$/.test(deadline) &&
          BigInt(deadline) > BigInt(0) && BigInt(Date.now()) > BigInt(deadline) * BigInt(1000)) {
          publish({ ...saved, phase: "failed", error: new SpotError("ORDER_EXPIRED", "The signed swap expired and was not found in order history. Review a new swap before trying again.") });
          return;
        }
        throw new Error("The original order has not appeared in history yet. Check its status again before starting another swap.");
      }
      if ((acceptedOrder && (order.id !== acceptedOrder.id || order.historyKey !== acceptedOrder.historyKey)) ||
        order.chainId !== client.chainId || order.maker.toLowerCase() !== account.toLowerCase() ||
        (signedOrder && !(order.version === 2 && "order" in order.rawOrder && matchesSignedSwap(signedOrder, order.rawOrder.order)))) {
        throw new Error("The returned order does not match the original swap.");
      }
      if (order.status === OrderStatus.Completed) {
        publish({ ...saved, phase: "success", order, error: undefined });
        useDirectSwapStore.setState({ confirmedWrap: undefined });
        void refreshBalances([saved.review.quote.request.inToken]).catch(() => undefined);
      } else if (order.status === OrderStatus.Cancelled || order.status === OrderStatus.Expired) {
        const reason = order.status === OrderStatus.Cancelled ? "cancelled" : "expired";
        publish({ ...saved, phase: "failed", order, error: new OrderSettlementError(`The original swap ${reason === "cancelled" ? "was cancelled" : "expired"}.`, reason, order.id) });
      } else {
        publish({ ...saved, phase: "unconfirmed", order, error: new Error("The original swap is still open. Check its status again before starting another swap.") });
      }
    } catch (cause) {
      publish({ ...useDirectSwapStore.getState().execution, phase: "unconfirmed", error: normalizeError(cause) });
    } finally {
      abort.abort();
      if (useDirectSwapStore.getState().controller === abort) useDirectSwapStore.setState({ controller: undefined });
      if (ownedController.current === abort) ownedController.current = undefined;
    }
  }, [publish, refreshBalances]);
  const reset = useCallback(() => {
    const saved = useDirectSwapStore.getState();
    if (!saved.controller && saved.execution.phase !== "unconfirmed") publish(idleSwapExecution());
  }, [publish]);

  return { ...state, isActive: activePhases.has(state.phase),
    hasConfirmedWrap: Boolean(confirmedWrap && confirmedWrap.hash === state.wrapTxHash),
    execute, checkOrderStatus, reset };
};

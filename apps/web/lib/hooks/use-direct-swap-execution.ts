"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  OrderSettlementError,
  SpotError,
  type OrderWalletInteractions,
} from "@orbs-network/spot-react";
import { getConnection } from "wagmi/actions";
import { wagmiConfig } from "../wagmi-config";
import { useSwapStore } from "./store";
import { idleSwapExecution, useDirectSwapStore, type DirectSwapPhase, type DirectSwapState, type SwapReview } from "../swap-execution-store";

export type { DirectSwapPhase, SwapReview } from "../swap-execution-store";
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

/** Host-owned swap orchestration; the SDK alone submits and polls the order. */
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

  const execute = useCallback(async (review: SwapReview): Promise<void> => {
    const saved = useDirectSwapStore.getState();
    if (saved.controller || saved.execution.phase === "unconfirmed") return;
    const abort = new AbortController();
    ownedController.current = abort;
    useDirectSwapStore.setState({ controller: abort });
    let execution: DirectSwapState = { ...idleSwapExecution(), phase: "preparing", review };
    let submissionStarted = false;
    let wrapRequired = false;
    let wrapAmount = review.quote.request.inAmount;
    const update = (changes: Partial<DirectSwapState>) => {
      if (useDirectSwapStore.getState().controller !== abort) return;
      execution = { ...execution, ...changes };
      publish(execution);
    };
    const check = () => {
      abort.signal.throwIfAborted();
      if (useDirectSwapStore.getState().controller !== abort) throw new Error("This swap attempt is no longer active.");
      const connection = getConnection(wagmiConfig);
      if (scope.current !== review.contextKey ||
        useSwapStore.getState().inputAmount !== review.inputAmountUi ||
        connection.chainId !== review.client.chainId ||
        connection.address?.toLowerCase() !== review.account.toLowerCase()) {
        throw new Error("The wallet or reviewed swap changed. Review the swap again.");
      }
    };
    update({});
    try {
      check();
      const wallet: OrderWalletInteractions = {
        ...walletInteractions,
        shouldWrap: async () => {
          check();
          const amount = review.quote.request.inAmount;
          wrapRequired = await walletInteractions.shouldWrap();
          check();
          const previous = useDirectSwapStore.getState().confirmedWrap;
          if (wrapRequired && previous?.contextKey === review.contextKey && previous.account === review.account.toLowerCase()) {
            if (!walletInteractions.getTokenBalance) throw new Error("Read the wrapped-token balance before retrying this swap.");
            const balance = BigInt(await walletInteractions.getTokenBalance({ tokenAddress: review.quote.request.inToken }));
            check();
            wrapAmount = (BigInt(amount) > balance ? BigInt(amount) - balance : BigInt(0)).toString();
            wrapRequired = BigInt(wrapAmount) > BigInt(0);
            update({ wrapTxHash: previous.hash });
          }
          return wrapRequired;
        },
        getAllowance: async (request) => {
          check();
          const allowance = await walletInteractions.getAllowance(request);
          check();
          if (execution.steps.length === 0) {
            update({ steps: [
              ...(wrapRequired ? ["wrap" as const] : []),
              ...(BigInt(allowance) < BigInt(review.quote.request.inAmount) ? ["approve" as const] : []),
              "create",
            ] });
          }
          return allowance;
        },
        wrapNativeToken: async () => {
          check();
          update({ phase: "wrapping" });
          const hash = await walletInteractions.wrapNativeToken(wrapAmount);
          useDirectSwapStore.setState({ confirmedWrap: { contextKey: review.contextKey, account: review.account.toLowerCase(), hash } });
          check();
          update({ wrapTxHash: hash, stepIndex: execution.stepIndex + 1 });
          void refreshBalances([review.quote.request.inToken]).catch(() => undefined);
          check();
          return hash;
        },
        approveToken: async (request) => {
          check();
          update({ phase: "approving" });
          const hash = await walletInteractions.approveToken(request);
          check();
          update({ approvalTxHash: hash, stepIndex: execution.stepIndex + 1 });
          check();
          return hash;
        },
        signOrder: async (request) => {
          check();
          update({ phase: "signing", signedOrder: structuredClone(request.typedData.message) });
          const signature = await walletInteractions.signOrder(request);
          check();
          submissionStarted = true;
          update({ phase: "settling" });
          return signature;
        },
      };
      const completed = await review.client.executeSwap({
        quote: review.quote, account: review.account, walletInteractions: wallet, signal: abort.signal,
      });
      update({ phase: "success", order: completed.order });
      useDirectSwapStore.setState({ confirmedWrap: undefined });
      void refreshBalances([review.quote.request.inToken]).catch(() => undefined);
    } catch (cause) {
      const error = normalizeError(cause);
      const settlement = cause instanceof OrderSettlementError ? cause : undefined;
      const terminal = settlement?.reason === "cancelled" || settlement?.reason === "expired";
      const rejectedSubmission = cause instanceof SpotError && cause.code === "SUBMISSION_FAILED" &&
        typeof cause.status === "number" && cause.status < 500 && cause.status !== 408 && !cause.cause;
      // The SDK wraps in-flight POST aborts; only its preflight check returns this exact reason.
      const preflightAbort = abort.signal.aborted && cause === abort.signal.reason;
      update({
        phase: !terminal && !rejectedSubmission && !preflightAbort && (settlement || submissionStarted) ? "unconfirmed" : "failed",
        error,
        ...(settlement?.order ? { order: settlement.order } : {}),
      });
    } finally {
      abort.abort();
      if (useDirectSwapStore.getState().controller === abort) useDirectSwapStore.setState({ controller: undefined });
      if (ownedController.current === abort) ownedController.current = undefined;
    }
  }, [publish, refreshBalances, walletInteractions]);

  const resume = useCallback(async (): Promise<void> => {
    const host = useDirectSwapStore.getState();
    const saved = host.execution;
    if (host.controller || saved.phase !== "unconfirmed" || !saved.review) return;
    const abort = new AbortController();
    ownedController.current = abort;
    useDirectSwapStore.setState({ controller: abort });
    publish({ ...saved, phase: "settling", error: undefined });
    try {
      const { client, account } = saved.review;
      let order = saved.order;
      if (!order) {
        if (!saved.signedOrder) throw new Error("Check the original account's order history before starting another swap.");
        const history = await client.getAccountOrders({ account, getv1orders: false, legacyOrders: false, signal: abort.signal });
        order = history.orders.find(candidate => candidate.version === 2 && "order" in candidate.rawOrder &&
          matchesSignedSwap(saved.signedOrder, candidate.rawOrder.order));
        if (!order) throw new Error("The original order has not appeared in history yet. Check its status again before starting another swap.");
      }
      publish({ ...saved, phase: "settling", order, error: undefined });
      const completed = await client.executeOrder({ order, signal: abort.signal });
      publish({ ...saved, phase: "success", order: completed, error: undefined });
      useDirectSwapStore.setState({ confirmedWrap: undefined });
      void refreshBalances([saved.review.quote.request.inToken]).catch(() => undefined);
    } catch (cause) {
      const settlement = cause instanceof OrderSettlementError ? cause : undefined;
      publish({ ...saved,
        phase: settlement?.reason === "cancelled" || settlement?.reason === "expired" ? "failed" : "unconfirmed",
        error: normalizeError(cause), order: settlement?.order ?? useDirectSwapStore.getState().execution.order,
      });
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
    canUseConfirmedWrap: confirmedWrap?.contextKey === contextKey,
    execute, resume, reset };
};

import { getOrders, Module, OrderSettlementError, type Order, type RePermitOrder } from "@orbs-network/spot-ui";
import type { StoreApi } from "zustand/vanilla";
import type { SpotStore } from "./context/create-spot-store";
import { ExecutionPhase, type Callbacks, type SwapExecution } from "./types";
import { isUnconfirmedExecutionError, normalizeError, observe, parseExecutionError } from "./execution-state";
import { addAcceptedOrderToCache, waitForSwapOrder } from "./wait-for-swap-order";
import { createOperationAnalytics, getExecutionAnalyticsContext } from "./analytics";

// Compare every signed field, rather than treating a matching timestamp nonce as identity.
const asInteger = (value: unknown): bigint | undefined => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
};

const matchesPayload = (expected: unknown, actual: unknown): boolean => {
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") return false;
    return Object.entries(expected).every(([key, value]) =>
      matchesPayload(value, Reflect.get(actual, key)),
    );
  }
  const expectedInteger = asInteger(expected);
  const actualInteger = asInteger(actual);
  if (expectedInteger !== undefined || actualInteger !== undefined) {
    return expectedInteger !== undefined && expectedInteger === actualInteger;
  }
  if (typeof expected === "number" || typeof actual === "number") return false;
  if (typeof expected === "string" && typeof actual === "string") {
    if (/^0x/i.test(expected)) return expected.toLowerCase() === actual.toLowerCase();
  }
  return expected === actual;
};

const findAcceptedOrder = (orders: Order[], prepared: RePermitOrder): Order | undefined =>
  orders.find(candidate => candidate.version === 2 && "order" in candidate.rawOrder &&
    matchesPayload(prepared, candidate.rawOrder.order),
  );

/** Reconciles the saved attempt using read-only lookups; never signs or submits again. */
export async function resumeExecution({ store, callbacks, signal, disableAnalytics }: {
  store: StoreApi<SpotStore>;
  callbacks?: Callbacks;
  signal: AbortSignal;
  disableAnalytics?: boolean;
}): Promise<Order | undefined> {
  const saved = store.getState().state.currentExecution;
  if (saved.phase !== ExecutionPhase.UNCONFIRMED || saved.executionId === undefined) return;
  const executionId = saved.executionId;
  const analytics = saved.analytics ?? createOperationAnalytics(
    getExecutionAnalyticsContext(saved), undefined, disableAnalytics,
  );
  if (disableAnalytics !== undefined) observe(() => analytics.setDisabled(disableAnalytics));
  let execution: SwapExecution = {
    ...saved, analytics, phase: ExecutionPhase.SETTLING, error: undefined, parsedError: undefined,
  };
  if (!store.getState().replaceExecution(executionId, execution)) return;
  observe(() => analytics.onRecoveryRequest());
  const transition = (phase: ExecutionPhase, changes: Partial<SwapExecution> = {}): boolean => {
    const next = { ...execution, ...changes, phase };
    if (!store.getState().replaceExecution(executionId, next)) return false;
    execution = next;
    return true;
  };
  let trackingStarted = false;
  try {
    signal.throwIfAborted();
    let order = execution.order;
    const recoveredAcceptance = !order;
    // Unknown acceptance needs history discovery; saved orders go straight to
    // the SDK's bounded read-only recovery, even after the original deadline.
    if (!order) {
      if (!execution.account || !execution.chainId || !execution.preparedOrder) {
        throw new Error("The original swap status is still unknown. Check its account history before starting another swap.");
      }
      const orders = await getOrders({
        swapper: execution.account, chainId: execution.chainId, getv1orders: false, signal,
        apiUrl: execution.apiUrl,
      });
      order = findAcceptedOrder(orders, execution.preparedOrder.order);
      if (!order) {
        throw new OrderSettlementError(
          "The original order has not appeared in history yet. Check its status again before starting another swap.",
          "unconfirmed", execution.orderId ?? "",
        );
      }
    }
    signal.throwIfAborted();
    if (!transition(ExecutionPhase.SETTLING, { order, orderId: order.id })) return;
    observe(() => addAcceptedOrderToCache(store, order));
    if (recoveredAcceptance) {
      observe(() => analytics.onCreateOrderSuccess(order.id));
      observe(() => callbacks?.onOrderCreated?.(order));
    }
    trackingStarted = execution.form?.module === Module.SWAP;
    const completed = execution.form?.module === Module.SWAP
      ? await waitForSwapOrder({ store, callbacks, order, executionId, signal })
      : order;
    transition(ExecutionPhase.SUCCESS, { order: completed, orderId: completed.id });
    return completed;
  } catch (error) {
    // The SDK reports settlement outcomes; this covers recovery lookup failures before it starts.
    if (!trackingStarted) {
      observe(() => execution.form?.module === Module.SWAP
        ? analytics.onSettlementError(error)
        : analytics.onRecoveryError(error));
    }
    const settlementOrder = error instanceof OrderSettlementError ? error.order : undefined;
    transition(isUnconfirmedExecutionError(error, ExecutionPhase.SETTLING)
      ? ExecutionPhase.UNCONFIRMED : ExecutionPhase.FAILED, {
      ...(settlementOrder ? { order: settlementOrder, orderId: settlementOrder.id } : {}),
      error: normalizeError(error), parsedError: parseExecutionError(error),
    });
    throw error;
  }
}

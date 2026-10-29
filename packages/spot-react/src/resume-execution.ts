import { getOrders, Module, OrderSettlementError, OrderStatus, type Order, type RePermitOrder } from "@orbs-network/spot-ui";
import type { StoreApi } from "zustand/vanilla";
import type { SpotStore } from "./context/create-spot-store";
import { ExecutionPhase, type Callbacks, type SwapExecution } from "./types";
import { isUnconfirmedExecutionError, normalizeError, observe, parseExecutionError } from "./execution-state";
import { addAcceptedOrderToCache, waitForSwapOrder } from "./wait-for-swap-order";

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
export async function resumeExecution({ store, callbacks, signal }: {
  store: StoreApi<SpotStore>;
  callbacks?: Callbacks;
  signal: AbortSignal;
}): Promise<Order | undefined> {
  const saved = store.getState().state.currentExecution;
  if (saved.phase !== ExecutionPhase.UNCONFIRMED || saved.executionId === undefined) return;
  const executionId = saved.executionId;
  let execution: SwapExecution = {
    ...saved, phase: ExecutionPhase.SETTLING, error: undefined, parsedError: undefined,
  };
  if (!store.getState().replaceExecution(executionId, execution)) return;
  const transition = (phase: ExecutionPhase, changes: Partial<SwapExecution> = {}): boolean => {
    const next = { ...execution, ...changes, phase };
    if (!store.getState().replaceExecution(executionId, next)) return false;
    execution = next;
    return true;
  };
  try {
    signal.throwIfAborted();
    let order = execution.order;
    const recoveredAcceptance = !order;
    // The poller stops at deadline + grace. A later recovery must read fresh
    // history before handing it the saved, still-open snapshot again.
    if (!order || (order.status === OrderStatus.Open && order.deadline + 60_000 <= Date.now())) {
      if (!execution.account || !execution.chainId || (!order && !execution.preparedOrder)) {
        throw new Error("The original swap status is still unknown. Check its account history before starting another swap.");
      }
      const orders = await getOrders({
        swapper: execution.account, chainId: execution.chainId, getv1orders: false, signal,
      });
      const previousOrder = order;
      order = previousOrder
        ? orders.find(candidate => candidate.id.toLowerCase() === previousOrder.id.toLowerCase() &&
            candidate.chainId === previousOrder.chainId && candidate.historyKey === previousOrder.historyKey)
        : execution.preparedOrder && findAcceptedOrder(orders, execution.preparedOrder.order);
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
    if (recoveredAcceptance) observe(() => callbacks?.onOrderCreated?.(order));
    const completed = execution.form?.module === Module.SWAP
      ? await waitForSwapOrder({ store, callbacks, order, executionId, signal })
      : order;
    transition(ExecutionPhase.SUCCESS, { order: completed, orderId: completed.id });
    return completed;
  } catch (error) {
    transition(isUnconfirmedExecutionError(error, ExecutionPhase.SETTLING)
      ? ExecutionPhase.UNCONFIRMED : ExecutionPhase.FAILED, {
      error: normalizeError(error), parsedError: parseExecutionError(error),
    });
    throw error;
  }
}

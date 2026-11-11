import { createClient, OrderStatus, OrderVariant, OrderSettlementError, type Order } from "@orbs-network/spot-ui";
import type { StoreApi } from "zustand/vanilla";
import type { SpotStore } from "./context/create-spot-store";
import { ExecutionPhase, type Callbacks, type OrderExecutionState } from "./types";
import { normalizeError, observe, parseExecutionError } from "./execution-state";
import { updateTrackedOrderInCache } from "./order-cache";
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

const findAcceptedOrder = (orders: Order[], prepared: unknown): Order | undefined =>
  orders.find(candidate => candidate.version === 2 && "order" in candidate.rawOrder &&
    matchesPayload(prepared, candidate.rawOrder.order),
  );

/** Reconcile unresolved foreground and background attempts without submitting again. */
export async function checkOrderStatus({ store, callbacks, signal }: {
  store: StoreApi<SpotStore>;
  callbacks?: Callbacks;
  signal?: AbortSignal;
}): Promise<Order | undefined> {
  const targets = [store.getState().state.currentExecution, ...store.getState().getBackgroundExecutions()]
    .filter(saved => saved.phase === ExecutionPhase.UNCONFIRMED && saved.executionId !== undefined);
  const results = await Promise.allSettled(targets.map(async saved => {
    const executionId = saved.executionId;
    if (executionId === undefined) return;
    const controller = store.getState().acquireExecutionController(executionId);
    if (!controller) return;
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    try {
      return await reconcileOrderStatus({ store, saved, callbacks: saved.callbacks ?? callbacks, signal: controller.signal });
    } finally {
      signal?.removeEventListener("abort", abort);
      store.getState().finishExecution(executionId);
      store.getState().releaseExecutionController(controller);
    }
  }));
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) return result.value;
  }
}

async function reconcileOrderStatus({ store, saved, callbacks, signal }: {
  store: StoreApi<SpotStore>;
  saved: OrderExecutionState;
  callbacks?: Callbacks;
  signal: AbortSignal;
}): Promise<Order | undefined> {
  const executionId = saved.executionId;
  if (executionId === undefined) return;
  let analytics = saved.client
    ? createOperationAnalytics(getExecutionAnalyticsContext(saved), saved.client)
    : saved.analytics ?? createOperationAnalytics(getExecutionAnalyticsContext(saved));
  let execution: OrderExecutionState = { ...saved, phase: ExecutionPhase.SETTLING, error: undefined, parsedError: undefined };
  if (!store.getState().replaceExecution(executionId, execution)) return;
  const transition = (phase: ExecutionPhase, changes: Partial<OrderExecutionState> = {}): boolean => {
    const next = { ...execution, ...changes, phase };
    if (!store.getState().replaceExecution(executionId, next)) return false;
    execution = next;
    return true;
  };
  const unknown = (message: string): void => {
    const error = new Error(message);
    transition(ExecutionPhase.UNCONFIRMED, { error, parsedError: parseExecutionError(error) });
  };
  try {
    signal.throwIfAborted();
    const { chainId, partner, apiUrl, account } = saved;
    if (!chainId || !partner || !account) throw new Error("The original order's client scope is unavailable");
    const client = saved.client ?? await createClient(partner, chainId, { apiUrl, disableAnalytics: analytics.isDisabled });
    signal.throwIfAborted();
    if (client.chainId !== chainId || client.partner !== partner || (apiUrl !== undefined && client.apiUrl !== apiUrl)) {
      throw new Error("The status client does not match the original order scope");
    }
    analytics = createOperationAnalytics(getExecutionAnalyticsContext(saved), client);
    if (!transition(ExecutionPhase.SETTLING, { client, analytics })) return;
    observe(() => analytics.onRecoveryRequest());
    const prepared = saved.preparedOrder?.order ?? saved.sdkExecution?.preparedOrder?.order;
    const cached = prepared ? findAcceptedOrder(store.getState().orders.data ?? [], prepared) : undefined;
    const cachedOrder = cached && cached.chainId === chainId && cached.maker.toLowerCase() === account.toLowerCase() ? cached : undefined;
    const knownOrder = saved.order ?? saved.sdkExecution?.order ?? cachedOrder;
    const orderId = knownOrder?.id ?? saved.orderId;
    let order: Order | undefined;
    if (orderId) {
      order = await client.getOrder({ orderId, signal });
    } else {
      if (!prepared) throw new Error("Check the original account's order history before creating another order.");
      // Require the original current service to succeed. A legacy-only partial
      // result cannot prove that the submitted payload is absent.
      const history = await client.getOrders({ account, legacyOrders: false, getv1orders: false, rejectInvalidOrders: true, signal });
      order = findAcceptedOrder(history.orders, prepared);
    }
    signal.throwIfAborted();
    if (!order) {
      unknown("The original order has not appeared in history yet and may still have been accepted. Check its status before retrying the same order.");
      return;
    }
    if ((orderId && order.id !== orderId) || (knownOrder && order.historyKey !== knownOrder.historyKey) ||
      order.chainId !== chainId || order.maker.toLowerCase() !== account.toLowerCase() ||
      (prepared && !(order.version === 2 && "order" in order.rawOrder && matchesPayload(prepared, order.rawOrder.order)))) {
      throw new Error("The returned order does not match the original intent");
    }
    if (!transition(ExecutionPhase.SETTLING, { order, orderId: order.id })) return;
    observe(() => updateTrackedOrderInCache(store, order, callbacks, saved.partner));
    if (!saved.order) observe(() => callbacks?.onOrderCreated?.(order));
    if (saved.form || order.type !== OrderVariant.SWAP || order.status === OrderStatus.Completed) {
      transition(ExecutionPhase.SUCCESS, { order, error: undefined, parsedError: undefined });
    } else if (order.status === OrderStatus.Cancelled || order.status === OrderStatus.Expired) {
      const error = new OrderSettlementError(
        `The original swap ${order.status === OrderStatus.Cancelled ? "was cancelled" : "expired"}.`,
        order.status === OrderStatus.Cancelled ? "cancelled" : "expired", order.id,
      );
      transition(ExecutionPhase.FAILED, { order, error, parsedError: parseExecutionError(error) });
    } else {
      unknown("The original swap is still open. Check its status again before creating another swap.");
    }
    return order;
  } catch (error) {
    observe(() => analytics.onRecoveryError(error));
    transition(ExecutionPhase.UNCONFIRMED, { error: normalizeError(error), parsedError: parseExecutionError(error) });
    throw error;
  }
}

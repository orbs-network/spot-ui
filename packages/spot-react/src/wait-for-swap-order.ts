import type { Order } from "@orbs-network/spot-ui";
import { createClientWithAnalytics, resumeClientOrder } from "@orbs-network/spot-ui/internal";
import type { StoreApi } from "zustand/vanilla";
import type { SpotStore } from "./context/create-spot-store";
import { observe } from "./execution-state";
import type { Callbacks } from "./types";

const matchesOrderScope = (key: string | undefined, order: Order, partner: string | undefined): boolean => {
  if (!key || typeof order.maker !== "string" || !partner || !order.rawOrder || !("order" in order.rawOrder)) return false;
  const adapter = order.rawOrder.order.witness.exchange.adapter;
  let scope: unknown;
  try { scope = JSON.parse(key); }
  catch { return false; }
  // History keys contain account, adapter, partner, chain, and legacy support.
  return Array.isArray(scope) && typeof scope[0] === "string" && typeof scope[1] === "string" &&
    scope[0].toLowerCase() === order.maker.toLowerCase() &&
    scope[1].toLowerCase() === adapter.toLowerCase() && scope[2] === partner && scope[3] === order.chainId;
};

/** Save an accepted snapshot only in the original account/adapter/partner/chain cache. */
export const addAcceptedOrderToCache = (store: StoreApi<SpotStore>, order: Order): boolean => {
  const state = store.getState();
  const key = state.orders.key;
  if (!matchesOrderScope(key, order, state.state.currentExecution.partner)) return false;
  state.addOrder(order);
  return store.getState().orders.key === key;
};

/** Apply SDK settlement snapshots only to the original account/adapter/partner/chain cache. */
export const updateTrackedOrderInCache = (
  store: StoreApi<SpotStore>, order: Order, callbacks?: Callbacks,
): void => {
  const state = store.getState();
  if (matchesOrderScope(state.orders.key, order, state.state.currentExecution.partner)) {
    state.updateOrder(order, callbacks);
  }
};

/** Resume the SDK's settlement flow without signing or submitting the accepted order again. */
export const waitForSwapOrder = async ({ store, callbacks, order, executionId, signal }: {
  store: StoreApi<SpotStore>;
  callbacks?: Callbacks;
  order: Order;
  executionId: number;
  signal: AbortSignal;
}): Promise<Order> => {
  const controller = new AbortController();
  const checkScope = () => {
    if (signal.aborted || store.getState().state.currentExecution.executionId !== executionId) controller.abort();
  };
  signal.addEventListener("abort", checkScope, { once: true });
  const unsubscribe = store.subscribe(checkScope);
  checkScope();
  const analytics = store.getState().state.currentExecution.analytics;
  let sdkTrackingStarted = false;
  try {
    if (!controller.signal.aborted) observe(() => addAcceptedOrderToCache(store, order));
    const execution = store.getState().state.currentExecution;
    const { apiUrl, partner, chainId } = execution;
    let client = execution.client;
    if (!client) {
      if (!partner || !chainId) throw new Error("The original order's client scope is unavailable");
      client = await createClientWithAnalytics(partner, chainId, { apiUrl }, analytics);
    }
    checkScope();
    controller.signal.throwIfAborted();
    if (client.chainId !== order.chainId || client.chainId !== chainId ||
      client.partner !== partner || (apiUrl !== undefined && client.apiUrl !== apiUrl)) {
      throw new Error("The recovery client does not match the original order scope");
    }
    sdkTrackingStarted = true;
    return await resumeClientOrder(client, { order, signal: controller.signal }, {
      analytics,
      onUpdate: (current) => {
        if (controller.signal.aborted) return;
        observe(() => updateTrackedOrderInCache(store, current, callbacks));
      },
    });
  } catch (error) {
    if (!sdkTrackingStarted) observe(() => analytics?.onRecoveryError(error));
    throw error;
  } finally {
    unsubscribe();
    signal.removeEventListener("abort", checkScope);
    controller.abort();
  }
};

import { watchOrder, type Order } from "@orbs-network/spot-ui";
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

/** React cache adapter around the framework-neutral SDK settlement poller. */
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
  try {
    let settled = order;
    if (!controller.signal.aborted) observe(() => addAcceptedOrderToCache(store, order));
    for await (const current of watchOrder({ order, signal: controller.signal })) {
      if (controller.signal.aborted) continue;
      // Cache updates and host callbacks belong to the React adapter.
      observe(() => {
        const state = store.getState();
        if (matchesOrderScope(state.orders.key, order, state.state.currentExecution.partner)) {
          state.updateOrder(current, callbacks);
        }
      });
      settled = current;
    }
    return settled;
  } finally {
    unsubscribe();
    signal.removeEventListener("abort", checkScope);
    controller.abort();
  }
};

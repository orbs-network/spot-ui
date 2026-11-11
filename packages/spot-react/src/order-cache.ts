import type { Order } from "@orbs-network/spot-ui";
import type { StoreApi } from "zustand/vanilla";
import type { SpotStore } from "./context/create-spot-store";
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

/** Apply host settlement snapshots only to the original account/adapter/partner/chain cache. */
export const updateTrackedOrderInCache = (
  store: StoreApi<SpotStore>, order: Order, callbacks?: Callbacks, partner?: string,
): void => {
  const state = store.getState();
  if (matchesOrderScope(state.orders.key, order, partner ?? state.state.currentExecution.partner)) {
    state.updateOrder(order, callbacks);
  }
};


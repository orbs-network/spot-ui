import { watchOrder, type Order } from "@orbs-network/spot-ui";
import type { StoreApi } from "zustand/vanilla";
import type { SpotStore } from "./context/create-spot-store";
import { notifyOrderUpdates, structurallyShareOrders } from "./order-history-data";
import { observe } from "./execution-state";
import type { Callbacks } from "./types";

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
    for await (const current of watchOrder({ order, signal: controller.signal })) {
      if (controller.signal.aborted) continue;
      // Cache updates and host callbacks belong to the React adapter.
      observe(() => {
        const previousOrders = store.getState().orders.data ?? [order];
        const existing = previousOrders.find(candidate => candidate.historyKey === order.historyKey);
        store.setState(state => ({ orders: {
          ...state.orders,
          data: structurallyShareOrders(state.orders.data, existing
            ? previousOrders.map(candidate => candidate.historyKey === order.historyKey ? current : candidate)
            : [current, ...previousOrders]),
        } }));
        notifyOrderUpdates([existing ?? order], [current], callbacks);
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

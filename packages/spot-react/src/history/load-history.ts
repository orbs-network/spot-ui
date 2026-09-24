import {
  OrderStatus,
  observe,
  type Order,
  type SpotClient,
} from "@orbs-network/spot-ui";
import type { Callbacks } from "../provider/callbacks";
import { mergeCachedLegacyOrders } from "./selectors";

export const notifyOrderUpdates = (
  previousOrders: Order[] | undefined,
  orders: Order[],
  callbacks?: Callbacks,
): void => {
  if (!previousOrders) return;

  const currentOrdersByKey = new Map(
    orders.map((order) => [order.historyKey, order]),
  );
  const updatedOrders: Order[] = [];

  for (const previousOrder of previousOrders) {
    if (previousOrder.version !== 2) continue;
    const currentOrder = currentOrdersByKey.get(previousOrder.historyKey);
    if (!currentOrder || currentOrder.progress === previousOrder.progress) {
      continue;
    }

    updatedOrders.push(currentOrder);
    if (currentOrder.status === OrderStatus.Completed) {
      observe(() => callbacks?.onOrderFilled?.(currentOrder));
    }
  }

  if (updatedOrders.length > 0) {
    observe(() => callbacks?.onOrdersProgressUpdate?.(updatedOrders));
  }
};

/** A partial SDK result must not suppress the next legacy-history retry. */
export const loadOrderHistory = async ({
  client,
  account,
  signal,
  supportLegacyOrders,
  previousOrders,
  legacyLoaded,
  callbacks,
}: {
  client: Pick<SpotClient, "getAccountOrdersResult">;
  account: string;
  signal: AbortSignal;
  supportLegacyOrders: boolean;
  previousOrders?: Order[];
  legacyLoaded: boolean;
  callbacks?: Callbacks;
}): Promise<{ orders: Order[]; legacyLoaded: boolean }> => {
  const result = await client.getAccountOrdersResult({
    signal,
    account,
    legacyOrders: supportLegacyOrders && !legacyLoaded,
  });
  if (signal.aborted) throw signal.reason;
  notifyOrderUpdates(previousOrders, result.orders, callbacks);
  return {
    orders:
      supportLegacyOrders && !result.legacyLoaded
        ? mergeCachedLegacyOrders(result.orders, previousOrders)
        : result.orders,
    legacyLoaded: legacyLoaded || result.legacyLoaded,
  };
};

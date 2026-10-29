import { OrderStatus, type Order, type SpotClient } from "@orbs-network/spot-ui";
import { observe } from "./execution-state";
import type { Callbacks } from "./types";

export interface CategorizedOrders {
  all: Order[];
  open: Order[];
  completed: Order[];
  cancelled: Order[];
  expired: Order[];
}

// Every useOrders caller receives the same provider-owned array. Cache the
// derived groups by that array identity so multiple consumers sort only once.
const categorizedOrdersCache = new WeakMap<Order[], CategorizedOrders>();

export const categorizeOrders = (orders: Order[]): CategorizedOrders => {
  const cached = categorizedOrdersCache.get(orders);
  if (cached) return cached;

  const result: CategorizedOrders = {
    all: [...orders].sort((a, b) => b.createdAt - a.createdAt),
    open: [],
    completed: [],
    cancelled: [],
    expired: [],
  };

  // Build every status group in one pass over the already sorted list.
  for (const order of result.all) {
    switch (order.status) {
      case OrderStatus.Open:
        result.open.push(order);
        break;
      case OrderStatus.Completed:
        result.completed.push(order);
        break;
      case OrderStatus.Cancelled:
        result.cancelled.push(order);
        break;
      case OrderStatus.Expired:
        result.expired.push(order);
        break;
    }
  }

  categorizedOrdersCache.set(orders, result);
  return result;
};

export const mergeCachedLegacyOrders = (
  orders: Order[],
  cachedOrders?: Order[],
): Order[] => {
  const orderKeys = new Set(orders.map((order) => order.historyKey));
  const cachedLegacyOrders =
    cachedOrders?.filter(
      (order) => order.version === 1 && !orderKeys.has(order.historyKey),
    ) ?? [];

  return [...orders, ...cachedLegacyOrders];
};

/** Preserve accepted snapshots while older history requests finish indexing. */
export const mergeOrderSnapshots = (
  previousOrders: Order[] | undefined,
  orders: Order[],
): Order[] => {
  if (!previousOrders) return orders;
  const previousByKey = new Map(previousOrders.map(order => [order.historyKey, order]));
  const incomingKeys = new Set(orders.map(order => order.historyKey));
  const merged = orders.map(order => {
    const previous = previousByKey.get(order.historyKey);
    if (previous && (
      (previous.status === OrderStatus.Completed && order.status !== OrderStatus.Completed) ||
      (previous.status !== OrderStatus.Open && order.status === OrderStatus.Open)
    )) return previous;
    return order;
  });
  return [...merged, ...previousOrders.filter(order => !incomingKeys.has(order.historyKey))];
};

export const notifyOrderUpdates = (
  previousOrders: Order[] | undefined,
  orders: Order[],
  callbacks?: Callbacks,
  notifiedFilledOrders?: Set<string>,
  trackedOrder?: Order,
): void => {
  const filledOrderKeys = notifiedFilledOrders ?? new Set<string>();
  const notifyFilled = (order: Order): boolean => {
    if (filledOrderKeys.has(order.historyKey)) return false;
    filledOrderKeys.add(order.historyKey);
    observe(() => callbacks?.onOrderFilled?.(order));
    return true;
  };

  const currentOrdersByKey = new Map(
    orders.map((order) => [order.historyKey, order]),
  );
  const updatedOrders: Order[] = [];

  for (const previousOrder of previousOrders ?? []) {
    if (previousOrder.version !== 2) continue;
    const currentOrder = currentOrdersByKey.get(previousOrder.historyKey);
    if (!currentOrder || (
      currentOrder.progress === previousOrder.progress &&
      currentOrder.status === previousOrder.status
    )) {
      continue;
    }

    updatedOrders.push(currentOrder);
    if (currentOrder.status === OrderStatus.Completed && previousOrder.status !== OrderStatus.Completed) {
      notifyFilled(currentOrder);
    }
  }

  // A recovered/instant fill can already be completed when it is first tracked.
  if (trackedOrder?.status === OrderStatus.Completed && notifyFilled(trackedOrder) &&
    !updatedOrders.some(order => order.historyKey === trackedOrder.historyKey)) {
    updatedOrders.push(trackedOrder);
  }

  // Loading completed history alone is not a new fill in this provider session.
  for (const order of orders) {
    if (order.status === OrderStatus.Completed) filledOrderKeys.add(order.historyKey);
  }

  if (updatedOrders.length > 0) {
    observe(() => callbacks?.onOrdersProgressUpdate?.(updatedOrders));
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const replaceEqualDeep = (previous: unknown, next: unknown): unknown => {
  if (Object.is(previous, next)) return previous;

  if (Array.isArray(previous) && Array.isArray(next)) {
    const shared = next.map((value, index) =>
      replaceEqualDeep(previous[index], value),
    );
    const isEqual =
      previous.length === shared.length &&
      shared.every((value, index) => value === previous[index]);
    return isEqual ? previous : shared;
  }

  if (isPlainObject(previous) && isPlainObject(next)) {
    const previousKeys = Object.keys(previous);
    const nextKeys = Object.keys(next);
    const shared: Record<string, unknown> = {};
    let equalValues = previousKeys.length === nextKeys.length;

    for (const key of nextKeys) {
      if (!Object.prototype.hasOwnProperty.call(previous, key)) {
        equalValues = false;
      }
      const value = replaceEqualDeep(previous[key], next[key]);
      shared[key] = value;
      if (value !== previous[key]) equalValues = false;
    }

    return equalValues ? previous : shared;
  }

  return next;
};

// Polling APIs return fresh objects even when nothing changed. Reusing equal
// order and fill references prevents the history modal from rerendering every
// row after an unchanged poll.
export const structurallyShareOrders = (
  previousOrders: Order[] | undefined,
  orders: Order[],
): Order[] =>
  previousOrders
    ? (replaceEqualDeep(previousOrders, orders) as Order[])
    : orders;

/** A partial SDK result must not suppress the next legacy-history retry. */
export const loadOrderHistory = async ({
  client, account, signal, supportLegacyOrders, previousOrders, legacyLoaded,
}: {
  client: Pick<SpotClient, "getAccountOrdersResult">;
  account: string;
  signal: AbortSignal;
  supportLegacyOrders: boolean;
  previousOrders?: Order[];
  legacyLoaded: boolean;
}): Promise<{ orders: Order[]; legacyLoaded: boolean }> => {
  const result = await client.getAccountOrdersResult({
    signal, account, legacyOrders: supportLegacyOrders && !legacyLoaded,
  });
  if (signal.aborted) throw signal.reason;
  return {
    orders: supportLegacyOrders && !result.legacyLoaded
      ? mergeCachedLegacyOrders(result.orders, previousOrders)
      : result.orders,
    legacyLoaded: legacyLoaded || result.legacyLoaded,
  };
};

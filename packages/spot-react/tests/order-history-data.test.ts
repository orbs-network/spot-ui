import { describe, expect, it, vi } from "vitest";
import { OrderStatus, type Order } from "@orbs-network/spot-ui";
import {
  categorizeOrders,
  loadOrderHistory,
  notifyOrderUpdates,
  structurallyShareOrders,
} from "../src/order-history-data";

const createOrder = (
  historyKey: string,
  status: OrderStatus,
  createdAt: number,
  progress = 0,
): Order =>
  ({
    historyKey,
    id: historyKey,
    hash: historyKey,
    version: 2,
    status,
    createdAt,
    progress,
    fills: [],
  }) as Order;

describe("order history data", () => {
  it("retries partial legacy loads and retains cached legacy orders during an outage", async () => {
    const legacy = { ...createOrder("legacy", OrderStatus.Open, 1), version: 1 } as Order;
    const current = createOrder("current", OrderStatus.Open, 2);
    const getAccountOrdersResult = vi.fn()
      .mockResolvedValueOnce({ orders: [current], legacyLoaded: false })
      .mockResolvedValueOnce({ orders: [current, legacy], legacyLoaded: true })
      .mockResolvedValueOnce({ orders: [current], legacyLoaded: false });
    const params = {
      client: { getAccountOrdersResult }, account: "0x1",
      signal: new AbortController().signal, supportLegacyOrders: true,
      previousOrders: [legacy], legacyLoaded: false,
    };
    const partial = await loadOrderHistory(params);
    expect(partial).toEqual({ orders: [current, legacy], legacyLoaded: false });
    const recovered = await loadOrderHistory({ ...params, previousOrders: partial.orders, legacyLoaded: partial.legacyLoaded });
    expect(recovered.legacyLoaded).toBe(true);
    const cached = await loadOrderHistory({ ...params, previousOrders: recovered.orders, legacyLoaded: recovered.legacyLoaded });
    expect(cached.orders).toEqual([current, legacy]);
    expect(getAccountOrdersResult.mock.calls.map(([params]) => params.legacyOrders)).toEqual([true, true, false]);
  });

  it("categorizes and sorts a provider-owned array once", () => {
    const orders = [
      createOrder("older", OrderStatus.Open, 1),
      createOrder("newer", OrderStatus.Completed, 2, 100),
    ];

    const first = categorizeOrders(orders);
    const second = categorizeOrders(orders);

    expect(second).toBe(first);
    expect(first.all.map((order) => order.historyKey)).toEqual([
      "newer",
      "older",
    ]);
    expect(first.open).toEqual([orders[0]]);
    expect(first.completed).toEqual([orders[1]]);
  });

  it("reuses unchanged arrays and unaffected order objects", () => {
    const previous = [
      createOrder("changed", OrderStatus.Open, 2),
      createOrder("same", OrderStatus.Open, 1),
    ];
    const equal = previous.map((order) => ({ ...order, fills: [] }));
    const changed = equal.map((order, index) =>
      index === 0 ? { ...order, progress: 50 } : order,
    );

    expect(structurallyShareOrders(previous, equal)).toBe(previous);
    const shared = structurallyShareOrders(previous, changed);
    expect(shared).not.toBe(previous);
    expect(shared[0]).not.toBe(previous[0]);
    expect(shared[1]).toBe(previous[1]);
  });

  it("notifies only for changed v2 progress", () => {
    const previous = [createOrder("order", OrderStatus.Open, 1, 50)];
    const completed = createOrder(
      "order",
      OrderStatus.Completed,
      1,
      100,
    );
    const onOrderFilled = vi.fn();
    const onOrdersProgressUpdate = vi.fn();

    notifyOrderUpdates(previous, [completed], {
      onOrderFilled,
      onOrdersProgressUpdate,
    });

    expect(onOrderFilled).toHaveBeenCalledWith(completed);
    expect(onOrdersProgressUpdate).toHaveBeenCalledWith([completed]);
  });
});

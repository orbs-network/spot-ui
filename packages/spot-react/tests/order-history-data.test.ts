import { describe, expect, it, vi } from "vitest";
import { OrderStatus, type Order } from "@orbs-network/spot-ui";
import {
  categorizeOrders,
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

import { describe, expect, it } from "vitest";
import { OrderStatus, type Order } from "@orbs-network/spot-ui";
import { createCancelledOrder } from "../src/hooks/use-cancel-order";

const createOpenOrder = (version: number): Order =>
  ({
    version,
    status: OrderStatus.Open,
    historyKey: `v${version}:order`,
  }) as Order;

describe("cancel order callbacks", () => {
  it.each([1, 2])(
    "reports a cancelled snapshot for v%s orders",
    (version) => {
      const order = createOpenOrder(version);

      const cancelledOrder = createCancelledOrder(order);

      expect(cancelledOrder).not.toBe(order);
      expect(cancelledOrder.status).toBe(OrderStatus.Cancelled);
      expect(order.status).toBe(OrderStatus.Open);
    },
  );
});

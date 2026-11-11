import type { Order } from "@orbs-network/spot-ui";

/**
 * Tracking ended without a confirmed completed order.
 * `reason` distinguishes a reported cancellation/expiry from stopped (`aborted`)
 * or timed-out (`unconfirmed`) tracking. The latter two do not cancel the order;
 * check its history before submitting a replacement.
 */
export class OrderSettlementError extends Error {
  readonly name = "OrderSettlementError";
  /** Accepted or latest order snapshot, retained for read-only status recovery. */
  order?: Order;
  constructor(message: string, readonly reason: "cancelled" | "expired" | "unconfirmed" | "aborted", readonly orderId: string) { super(message); }
}


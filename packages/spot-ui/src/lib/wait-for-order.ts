import { getOrder } from "./orders/v2-orders";
import { OrderStatus, type Order } from "./types";
import { SpotError } from "./errors";

const INITIAL_POLL_DELAY_MILLIS = 2_000;
const MAX_POLL_DELAY_MILLIS = 30_000;

/**
 * Tracking ended without a confirmed completed order.
 * `reason` distinguishes a reported cancellation/expiry from stopped (`aborted`)
 * or timed-out (`unconfirmed`) tracking. The latter two do not cancel the order;
 * check its history before submitting a replacement.
 */
export class OrderSettlementError extends Error {
  readonly name = "OrderSettlementError";
  constructor(message: string, readonly reason: "cancelled" | "expired" | "unconfirmed" | "aborted", readonly orderId: string) { super(message); }
}

/** Clientless tracking inputs shared by {@link waitForOrder} and {@link watchOrder}. */
export interface WaitForOrderParams {
  /** Submitted order; its ID, chain, and deadline identify and bound tracking. */
  order: Order;
  /** Stops tracking with reason `"aborted"`; does not cancel the order itself. */
  signal?: AbortSignal;
}

/** Bounds even a lookup whose transport ignores cancellation. */
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([promise, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

function isSettled(order: Order): boolean {
  switch (order.status) {
    case OrderStatus.Completed: return true;
    case OrderStatus.Cancelled:
      throw new OrderSettlementError("Swap order was cancelled.", "cancelled", order.id);
    case OrderStatus.Expired:
      throw new OrderSettlementError("Swap order expired before it could execute.", "expired", order.id);
    default: return false;
  }
}

/**
 * Streams order snapshots until completion for progress displays or history caches.
 * Uses the order's ID and chain directly; no client or wallet is needed.
 * Lookups run serially, retrying missing/indexing results and request failures.
 * Missing or failed lookups back off from two to thirty seconds; a matching
 * snapshot resets the interval to two seconds.
 * Tracking ends one minute after the order's millisecond deadline if completion
 * cannot be confirmed. Breaking out of the loop releases timers and requests.
 *
 * @param params - Submitted order and optional tracking cancellation signal.
 * @returns An async stream of matching order snapshots, including the terminal snapshot.
 * @throws {@link OrderSettlementError} on cancellation, expiry, abort, or unconfirmed settlement.
 * A cancelled or expired snapshot is yielded before the error is thrown.
 * @throws If the order's ID, chain, or deadline is invalid.
 * @example
 * for await (const current of watchOrder({ order, signal })) {
 *   updateOrderHistory(current);
 * }
 */
export async function* watchOrder({ order, signal }: WaitForOrderParams): AsyncGenerator<Order, void, unknown> {
  const orderId = order?.id;
  if (!orderId) throw new SpotError("INVALID_ARGUMENT", "An order with a full ID is required");
  const { chainId, deadline, historyKey } = order;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new SpotError("INVALID_ARGUMENT", "The order must have a valid chain ID");
  if (!Number.isFinite(deadline)) throw new SpotError("INVALID_ARGUMENT", "The order must have a finite deadline");

  const controller = new AbortController();
  let poll: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => controller.abort(new OrderSettlementError(
    "Swap tracking stopped. Check order history before starting another swap.", "aborted", orderId,
  ));
  const armDeadline = () => {
    const remaining = deadline + 60_000 - Date.now();
    if (remaining <= 0) {
      controller.abort(new OrderSettlementError(
        "Unable to confirm the swap. Check order history before starting another swap.", "unconfirmed", orderId,
      ));
    } else {
      // Long-lived orders can exceed the platform's maximum timer delay.
      timeout = setTimeout(armDeadline, Math.min(remaining, 2_147_483_647));
    }
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();

  try {
    controller.signal.throwIfAborted();
    if (order.status !== OrderStatus.Open) {
      yield order;
      controller.signal.throwIfAborted();
      if (isSettled(order)) return;
    }
    armDeadline();
    let pollDelayMillis = INITIAL_POLL_DELAY_MILLIS;
    while (true) {
      controller.signal.throwIfAborted();
      let current: Order | undefined;
      try {
        current = await abortable(getOrder({ orderId, chainId, signal: controller.signal }), controller.signal);
      } catch {
        // Missing/indexing results and transient request errors remain retryable.
        controller.signal.throwIfAborted();
      }
      controller.signal.throwIfAborted();
      const matchesOrder = current && current.id.toLowerCase() === orderId.toLowerCase() && current.historyKey === historyKey;
      if (current && matchesOrder) {
        pollDelayMillis = INITIAL_POLL_DELAY_MILLIS;
        yield current;
        controller.signal.throwIfAborted();
        if (isSettled(current)) return;
      }
      const delayMillis = pollDelayMillis;
      if (!matchesOrder) {
        pollDelayMillis = Math.min(MAX_POLL_DELAY_MILLIS, pollDelayMillis * 2);
      }
      await abortable(new Promise<void>(resolve => { poll = setTimeout(resolve, delayMillis); }), controller.signal);
    }
  } finally {
    clearTimeout(poll);
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
    controller.abort();
  }
}

/**
 * Waits for a submitted order to complete and returns its latest snapshot.
 * Uses the order's ID, chain, and millisecond deadline; no client or wallet is needed.
 * Missing/indexing results and request failures are retried until one minute after
 * the deadline. Use {@link watchOrder} when intermediate snapshots are needed.
 *
 * @param params - Submitted order and optional tracking cancellation signal.
 * @returns The order with `OrderStatus.Completed`, confirming the fill.
 * @throws {@link OrderSettlementError} on cancellation, expiry, abort, or unconfirmed settlement.
 * An abort or timeout stops tracking only; check history before submitting a replacement.
 * @throws If the order's ID, chain, or deadline is invalid.
 * @example
 * const completed = await waitForOrder({ order: submitted.order });
 */
export async function waitForOrder(params: WaitForOrderParams): Promise<Order> {
  let current = params.order;
  for await (const update of watchOrder(params)) current = update;
  return current;
}

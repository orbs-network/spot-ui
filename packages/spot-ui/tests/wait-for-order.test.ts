import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalytics } from "../src/lib/analytics";
import { getOrder } from "../src/lib/orders/v2-orders";
import { OrderStatus, OrderVariant, type Order } from "../src/lib/types";
import { OrderSettlementError } from "../src/lib/order-settlement-error";
import { waitForOrder } from "../src/lib/internal/wait-for-order";

vi.mock("../src/lib/orders/v2-orders", () => ({ getOrder: vi.fn() }));

const snapshot = (status = OrderStatus.Open, progress = 0): Order => ({
  id: "0xsigned-order",
  historyKey: "2:137:0xsigned-order",
  chainId: 137,
  deadline: Date.now() + 180_000,
  maker: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  type: OrderVariant.SWAP,
  status,
  progress,
} as Order);

const analytics = () => createAnalytics({}, { disableAnalytics: true });

describe("waitForOrder progress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    vi.mocked(getOrder).mockReset();
  });

  afterEach(() => { vi.useRealTimers(); });

  it("reports polled progress and the completed snapshot before resolving", async () => {
    const order = snapshot();
    const pending = { ...order, progress: 25 };
    const completed = { ...order, status: OrderStatus.Completed, progress: 100 };
    vi.mocked(getOrder).mockResolvedValueOnce(pending).mockResolvedValueOnce(completed);
    const onProgress = vi.fn();
    const result = expect(waitForOrder({ order, onProgress, analytics: analytics() }))
      .resolves.toBe(completed);

    await vi.advanceTimersByTimeAsync(2_000);
    await result;

    expect(onProgress.mock.calls.map(([update]) => update)).toEqual([pending, completed]);
    expect(getOrder).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports the cancelled snapshot before rejecting settlement", async () => {
    const order = snapshot();
    const cancelled = { ...order, status: OrderStatus.Cancelled, progress: 25 };
    vi.mocked(getOrder).mockResolvedValue(cancelled);
    const events: string[] = [];
    const failure = await waitForOrder({
      order,
      analytics: analytics(),
      onProgress: (update) => { events.push(update.status); },
    }).catch((error: unknown) => {
      events.push("rejected");
      return error;
    });

    expect(failure).toBeInstanceOf(OrderSettlementError);
    expect(failure).toMatchObject({ reason: "cancelled", orderId: order.id, order: cancelled });
    expect(events).toEqual([OrderStatus.Cancelled, "rejected"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["throw", "reject"] as const)("ignores an observer's %s and still confirms completion", async (failure) => {
    const order = snapshot();
    const completed = { ...order, status: OrderStatus.Completed, progress: 100 };
    vi.mocked(getOrder).mockResolvedValue(completed);
    const onProgress = vi.fn(() => {
      const error = new Error("Progress UI failed");
      if (failure === "throw") throw error;
      return Promise.reject(error);
    });

    await expect(waitForOrder({ order, onProgress, analytics: analytics() })).resolves.toBe(completed);
    expect(onProgress).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops tracking when the observer aborts its signal", async () => {
    const order = snapshot();
    vi.mocked(getOrder).mockResolvedValue({ ...order, progress: 25 });
    const controller = new AbortController();
    const onProgress = vi.fn(() => { controller.abort(); });

    await expect(waitForOrder({
      order, signal: controller.signal, onProgress, analytics: analytics(),
    })).rejects.toMatchObject({ reason: "aborted", orderId: order.id, order: { progress: 25 } });
    expect(onProgress).toHaveBeenCalledOnce();
    expect(getOrder).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

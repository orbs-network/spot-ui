import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus, waitForOrder, watchOrder, type Order } from "../src";
import { buildV2Order } from "../src/lib/orders/v2-orders";
import { createV2Order } from "./fixtures";

const now = Date.UTC(2026, 9, 26);
const raw = createV2Order(56, "0x1234");
raw.order.deadline = String((now + 1000) / 1000);
const order = buildV2Order(raw);
const response = (status = "completed") => Response.json({ orders: [{ ...raw, metadata: { ...raw.metadata, status } }] });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("clientless order tracking", () => {
  it("derives the lookup identity from the submitted order without fetching configuration", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    await expect(waitForOrder({ order })).resolves.toMatchObject({ status: OrderStatus.Completed });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://order-sink-v2.orbs.network/orders?hash=0x1234&chainId=56",
      { signal: expect.any(AbortSignal), cache: "no-store" },
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns an already completed order without a request", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const completed = { ...order, status: OrderStatus.Completed };
    await expect(waitForOrder({ order: completed })).resolves.toBe(completed);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "expired"])("rejects %s orders with a typed reason", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => response(status)));
    await expect(waitForOrder({ order })).rejects.toMatchObject({ reason: status, orderId: order.id });
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([NaN, Infinity, undefined])("rejects invalid deadlines: %s", async deadline => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(waitForOrder({ order: { ...order, deadline } as Order })).rejects.toThrow("finite deadline");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, undefined])("rejects invalid chains: %s", async chainId => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(waitForOrder({ order: { ...order, chainId } as Order })).rejects.toThrow("valid chain ID");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a missing order ID before requesting", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(waitForOrder({ order: { ...order, id: "" } })).rejects.toThrow("full ID");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds a hung request using the order deadline and indexing grace", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: unknown, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }));
    const pending = waitForOrder({ order });
    const rejected = expect(pending).rejects.toMatchObject({ reason: "unconfirmed", orderId: order.id });
    await vi.advanceTimersByTimeAsync(61_000);
    await rejected;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("supports long deadlines without overflowing platform timers", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const controller = new AbortController();
    const pending = waitForOrder({ order: { ...order, deadline: now + 30 * 86_400_000 }, signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ reason: "aborted" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledOnce();
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("streams matching snapshots with the same minimal arguments and cleans up on early exit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("pending")));
    for await (const current of watchOrder({ order })) {
      expect(current).toEqual(order);
      break;
    }
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors cancellation while a consumer is processing a snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    const controller = new AbortController();
    const updates = watchOrder({ order, signal: controller.signal });
    expect((await updates.next()).value).toMatchObject({ status: OrderStatus.Completed });
    controller.abort();
    await expect(updates.next()).rejects.toMatchObject({ reason: "aborted" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

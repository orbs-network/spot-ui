import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus } from "@orbs-network/spot-ui";
import { buildV2Order } from "../../spot-ui/src/lib/orders/v2-orders";
import type { OrderV2 } from "../../spot-ui/src/lib/types";
import { createV2Order } from "../../spot-ui/tests/fixtures";
import { createSpotStore } from "../src/context/create-spot-store";
import { ExecutionPhase } from "../src/types";
import { waitForSwapOrder } from "../src/wait-for-swap-order";

const now = Date.UTC(2026, 9, 26);
const raw = createV2Order(56, "0x1234");
raw.order.deadline = String((now + 10_000) / 1000);
const order = buildV2Order(raw);
const filledRaw = { ...raw, metadata: { ...raw.metadata, status: "completed", chunks: [{
  status: "success", inAmount: "100", outAmount: "200", timestamp: new Date(now).toISOString(), txHash: "0xfill",
}] } } as OrderV2;
const filled = buildV2Order(filledRaw);
interface LookupParams { orderId: string; chainId: number; signal?: AbortSignal }

const setup = (lookup = vi.fn(async (_params: LookupParams): Promise<OrderV2 | undefined> => raw)) => {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const result = await lookup({ orderId: url.searchParams.get("hash")!, chainId: Number(url.searchParams.get("chainId")), signal: init?.signal ?? undefined });
    return Response.json({ orders: result ? [result] : [] });
  }));
  const store = createSpotStore({});
  const historyLoader = vi.fn(async () => ({ orders: [order], legacyLoaded: true }));
  store.getState().configureOrders("account:chain:partner", historyLoader);
  const started = store.getState().beginExecution({})!;
  for (const phase of [ExecutionPhase.SIGNING, ExecutionPhase.SUBMITTING, ExecutionPhase.SETTLING]) {
    store.getState().replaceExecution(started.executionId, { ...started, phase });
  }
  store.getState().addOrder(order);
  const controller = new AbortController();
  const callbacks = { onOrderFilled: vi.fn(), onOrdersProgressUpdate: vi.fn() };
  const promise = waitForSwapOrder({ store, callbacks, order, executionId: started.executionId, signal: controller.signal });
  return { store, lookup, historyLoader, callbacks, controller, promise };
};

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("swap settlement tracking", () => {
  it("polls only the submitted identity, waits through indexing delays, and updates only its cached row", async () => {
    const { store, lookup, historyLoader, callbacks, promise } = setup();
    const unrelated = { ...order, id: "other", historyKey: "unrelated" };
    store.getState().addOrder(unrelated);
    await vi.advanceTimersByTimeAsync(0);
    let completed = false;
    void promise.then(() => { completed = true; });
    const differentChain = { ...filledRaw, order: { ...filledRaw.order, witness: { ...filledRaw.order.witness, chainid: 137 } } };
    lookup.mockResolvedValueOnce(differentChain);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(completed).toBe(false);
    expect(store.getState().orders.data).toEqual([unrelated, order]);
    lookup.mockResolvedValueOnce(undefined);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(completed).toBe(false);
    lookup.mockResolvedValueOnce(filledRaw);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(promise).resolves.toEqual(filled);
    for (const [params] of lookup.mock.calls) {
      expect(params).toEqual({ orderId: order.id, chainId: order.chainId, signal: expect.any(AbortSignal) });
    }
    expect(historyLoader).not.toHaveBeenCalled();
    expect(store.getState().orders.data).toEqual([unrelated, filled]);
    expect(store.getState().orders.data?.[0]).toBe(unrelated);
    expect(callbacks.onOrderFilled).toHaveBeenCalledExactlyOnceWith(filled);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries temporary lookup errors without fetching account history", async () => {
    const { lookup, historyLoader, promise } = setup();
    await vi.advanceTimersByTimeAsync(0);
    lookup.mockRejectedValueOnce(new Error("Network unavailable"));
    await vi.advanceTimersByTimeAsync(2_000);
    lookup.mockResolvedValueOnce(filledRaw);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(promise).resolves.toEqual(filled);
    expect(historyLoader).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps settlement independent of throwing and rejecting host callbacks", async () => {
    const { store, lookup, callbacks, promise } = setup();
    await vi.advanceTimersByTimeAsync(0);
    callbacks.onOrderFilled.mockImplementation(() => { throw new Error("Host callback failed"); });
    callbacks.onOrdersProgressUpdate.mockImplementation(() => Promise.reject(new Error("Host callback rejected")));
    lookup.mockResolvedValueOnce(filledRaw);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(promise).resolves.toEqual(filled);
    expect(store.getState().orders.data).toEqual([filled]);
    expect(callbacks.onOrderFilled).toHaveBeenCalledExactlyOnceWith(filled);
    expect(callbacks.onOrdersProgressUpdate).toHaveBeenCalledExactlyOnceWith([filled]);
  });

  it.each(["abort", "deadline"])("ignores a late lookup response after %s", async stop => {
    let resolveLookup!: (current: OrderV2) => void;
    const lookup = vi.fn((_params: LookupParams) => new Promise<OrderV2>(resolve => { resolveLookup = resolve; }));
    const { store, controller, callbacks, promise } = setup(lookup);
    const rejected = expect(promise).rejects.toMatchObject({ reason: stop === "abort" ? "aborted" : "unconfirmed" });
    if (stop === "abort") controller.abort();
    else await vi.advanceTimersByTimeAsync(70_000);
    await rejected;
    resolveLookup(filledRaw);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().orders.data).toEqual([order]);
    expect(callbacks.onOrderFilled).not.toHaveBeenCalled();
    expect(callbacks.onOrdersProgressUpdate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["expired", "cancelled"])("updates history before rejecting %s orders", async status => {
    const { store, lookup, promise } = setup();
    await vi.advanceTimersByTimeAsync(0);
    lookup.mockResolvedValueOnce({ ...raw, metadata: { ...raw.metadata, status } });
    const rejection = expect(promise).rejects.toThrow(status);
    await vi.advanceTimersByTimeAsync(2_000);
    await rejection;
    expect(store.getState().orders.data?.[0].status).toBe(status === "expired" ? OrderStatus.Expired : OrderStatus.Cancelled);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts an in-flight lookup when the submitting component unmounts", async () => {
    const lookup = vi.fn((_params: LookupParams) => new Promise<OrderV2 | undefined>(() => {}));
    const { controller, promise } = setup(lookup);
    const rejection = expect(promise).rejects.toThrow("Check order history");
    const requestSignal = lookup.mock.calls[0]![0].signal;
    controller.abort();
    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never overlaps slow order requests", async () => {
    let resolveLookup!: (result: OrderV2) => void;
    const lookup = vi.fn(async (_params: LookupParams): Promise<OrderV2 | undefined> => raw)
      .mockImplementationOnce(() => new Promise<OrderV2>(resolve => { resolveLookup = resolve; }));
    const { promise } = setup(lookup);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(lookup).toHaveBeenCalledOnce();
    resolveLookup(raw);
    await vi.advanceTimersByTimeAsync(0);
    lookup.mockResolvedValueOnce(filledRaw);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(promise).resolves.toEqual(filled);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("directs users to history if the order cannot be confirmed after its deadline", async () => {
    const { promise } = setup();
    const rejection = expect(promise).rejects.toThrow("Unable to confirm the swap");
    await vi.advanceTimersByTimeAsync(70_000);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops tracking if the execution is replaced", async () => {
    const { store, promise } = setup();
    const rejection = expect(promise).rejects.toThrow("Swap tracking stopped");
    store.setState(state => ({ state: { ...state.state, currentExecution: { ...state.state.currentExecution, executionId: 2 } } }));
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });
});

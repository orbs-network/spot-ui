import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildV2Order, getOrder } from "../src/lib/orders/v2-orders";
import { OrderStatus, type Order, type OrderV2 } from "../src/lib/types";
import { waitForOrder, watchOrder } from "../src/lib/wait-for-order";

vi.mock("../src/lib/orders/v2-orders", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/lib/orders/v2-orders")>();
  return { ...original, getOrder: vi.fn() };
});

const address = "0x0000000000000000000000000000000000000001";
const firstId = `0x${"1".repeat(64)}`;
const secondId = `0x${"2".repeat(64)}`;
const now = 1_700_000_000_000;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
};

const makeOrder = (id: string, deadlineMillis = now + 180_000): Order => {
  const deadline = String(deadlineMillis / 1000);
  const raw: OrderV2 = {
    hash: id,
    signature: "0x",
    timestamp: new Date(now).toISOString(),
    metadata: {
      status: "pending",
      description: "",
      expectedChunks: 1,
      chunks: [],
      lastPriceCheck: "",
      nextEligibleTime: "",
      displayOnlyInputTokenPriceUSD: "0",
      repermitDigest: id,
    },
    order: {
      permitted: { token: address, amount: "100" },
      spender: address,
      nonce: "1",
      deadline,
      witness: {
        reactor: address,
        executor: address,
        exchange: { adapter: address, ref: address, share: 0, data: "0x" },
        swapper: address,
        nonce: "1",
        start: String((deadlineMillis - 180_000) / 1000),
        deadline,
        chainid: 56,
        exclusivity: 0,
        epoch: 0,
        slippage: 0,
        freshness: 60,
        input: { token: address, amount: "100", maxAmount: "100" },
        output: { token: address, limit: "200", recipient: address },
      },
    },
  };
  return buildV2Order(raw);
};

const lookup = vi.mocked(getOrder);
const requestSignal = (orderId: string): AbortSignal | undefined =>
  lookup.mock.calls.find(([request]) => request.orderId === orderId)?.[0].signal;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  lookup.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("concurrent accepted swap settlement", () => {
  it.each([
    [OrderStatus.Expired, "expired"],
    [OrderStatus.Cancelled, "cancelled"],
  ] as const)("isolates a %s snapshot from another order's pending lookup", async (status, reason) => {
    const first = makeOrder(firstId, now - 1000);
    const second = makeOrder(secondId);
    const terminalFirst = { ...first, status };
    const completedSecond = { ...second, status: OrderStatus.Completed };
    const secondLookup = deferred<Order | undefined>();
    lookup.mockImplementation(({ orderId }) => orderId === first.id
      ? Promise.resolve(terminalFirst)
      : secondLookup.promise);

    const firstTracking = watchOrder({ order: first });
    const secondTracking = waitForOrder({ order: second });
    expect((await firstTracking.next()).value).toBe(terminalFirst);
    expect(requestSignal(first.id)).not.toBe(requestSignal(second.id));
    expect(requestSignal(second.id)?.aborted).toBe(false);

    await expect(firstTracking.next()).rejects.toMatchObject({ reason, orderId: first.id });
    expect(requestSignal(first.id)?.aborted).toBe(true);
    expect(requestSignal(second.id)?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    secondLookup.resolve(completedSecond);
    await expect(secondTracking).resolves.toBe(completedSecond);
    expect(requestSignal(second.id)?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["aborted", "unconfirmed"] as const)(
    "keeps another order polling when one is %s and its lookup ignores cancellation",
    async (reason) => {
      const first = makeOrder(firstId, reason === "unconfirmed" ? now - 59_000 : now + 180_000);
      const second = makeOrder(secondId);
      const firstLookup = deferred<Order | undefined>();
      const completedSecond = { ...second, status: OrderStatus.Completed };
      let completeSecond = false;
      lookup.mockImplementation(({ orderId }) => orderId === first.id
        ? firstLookup.promise
        : Promise.resolve(completeSecond ? completedSecond : second));
      const stopFirst = new AbortController();
      const firstTracking = waitForOrder({ order: first, signal: stopFirst.signal });
      const firstFailed = expect(firstTracking).rejects.toMatchObject({ reason, orderId: first.id });
      const secondTracking = waitForOrder({ order: second });
      await vi.advanceTimersByTimeAsync(0);
      expect(requestSignal(first.id)).not.toBe(requestSignal(second.id));
      expect(vi.getTimerCount()).toBe(3);

      if (reason === "aborted") stopFirst.abort();
      else await vi.advanceTimersByTimeAsync(1000);
      await firstFailed;
      expect(requestSignal(first.id)?.aborted).toBe(true);
      expect(requestSignal(second.id)?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(2);

      // Even a transport that resolves after cancellation belongs to the old order.
      firstLookup.resolve({ ...first, status: OrderStatus.Completed });
      await vi.advanceTimersByTimeAsync(0);
      expect(requestSignal(second.id)?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(2);
      completeSecond = true;
      await vi.advanceTimersByTimeAsync(reason === "unconfirmed" ? 1000 : 2000);
      await expect(secondTracking).resolves.toBe(completedSecond);
      expect(lookup.mock.calls.filter(([request]) => request.orderId === first.id)).toHaveLength(1);
      expect(lookup.mock.calls.filter(([request]) => request.orderId === second.id)).toHaveLength(2);
      expect(requestSignal(second.id)?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

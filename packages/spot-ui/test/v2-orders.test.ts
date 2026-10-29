import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildV2Order, getOrder, getOrders } from "../src/lib/orders/v2-orders";
import { OrderStatus, type OrderV2 } from "../src/lib/types";
import { watchOrder } from "../src/lib/wait-for-order";

const address = "0x0000000000000000000000000000000000000001";
const deadline = "1789545045";
const now = Number(deadline) * 1000 + 1_000;

// Lifecycle fields from the reported expired order; protocol fields are synthetic.
const makeOrder = (status = "failed"): OrderV2 => ({
  hash: "0x7caa6b7b1151521cec0f055c4d4492ab1327a913f4679fe5bde4f49277a6454b",
  timestamp: "2026-09-16T07:39:47.711204598Z",
  signature: "0x",
  metadata: {
    status,
    description: "expired - all chunks errored",
    expectedChunks: 1,
    chunks: [],
    lastPriceCheck: "",
    nextEligibleTime: "",
    displayOnlyInputTokenPriceUSD: "0",
    repermitDigest: "0x",
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
      deadline,
      chainid: 56,
      exclusivity: 0,
      epoch: 60,
      slippage: 0,
      freshness: 0,
      input: { token: address, amount: "100", maxAmount: "100" },
      output: { token: address, limit: "1", recipient: address },
    },
  },
});

const successChunk: NonNullable<OrderV2["metadata"]["chunks"]>[number] = {
  blockId: 1,
  description: "",
  epoch: "1",
  exchange: address,
  executor: address,
  inAmount: "100",
  inToken: address,
  index: 1,
  minOut: "1",
  oraclePricingData: {
    message: {
      chainid: 56,
      cosigner: address,
      input: { decimals: "18", token: address, value: "1000000000000000000" },
      output: { decimals: "18", token: address, value: "2000000000000000000" },
      reactor: address,
      timestamp: Number(deadline) - 1,
    },
    oracle: address,
    signature: { r: "0x", s: "0x", v: "0x" },
    timestamp: "2026-09-16T07:50:44Z",
  },
  outAmount: "200",
  outToken: address,
  settled: true,
  status: "success",
  swapper: address,
  timestamp: "2026-09-16T07:50:44Z",
  txHash: "0x123",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("v2 order expiry", () => {
  it.each(["expired", "failed", "partially_completed", " FAILED "])(
    "maps terminal service status %s to Expired at the deadline",
    (status) => {
      vi.setSystemTime(Number(deadline) * 1000);
      expect(buildV2Order(makeOrder(status)).status).toBe(OrderStatus.Expired);
    },
  );

  it.each(["expired", "failed", "partially_completed"])(
    "keeps %s open before the deadline or with an invalid deadline",
    (status) => {
      const raw = makeOrder(status);
      vi.setSystemTime(Number(deadline) * 1000 - 1);
      expect(buildV2Order(raw).status).toBe(OrderStatus.Open);
      vi.setSystemTime(now);
      for (const invalid of ["invalid", "Infinity"]) {
        raw.order.deadline = invalid;
        expect(buildV2Order(raw).status).toBe(OrderStatus.Open);
      }
    },
  );

  it.each(["pending", "eligible", "new-service-status", ""])(
    "keeps %s open after the deadline while settlement is unconfirmed",
    (status) => {
      expect(buildV2Order(makeOrder(status)).status).toBe(OrderStatus.Open);
    },
  );

  it("preserves partial fills on an expired partially completed order", () => {
    const raw = makeOrder("partially_completed");
    raw.metadata.expectedChunks = 2;
    raw.metadata.chunks = [successChunk];
    expect(buildV2Order(raw)).toMatchObject({
      status: OrderStatus.Expired,
      progress: 50,
      srcAmountFilled: "100",
      dstAmountFilled: "200",
      fills: [{ inAmount: "100", outAmount: "200", txHash: "0x123" }],
    });
  });

  it("prioritizes completed fills and reported completion over expiry", () => {
    const raw = makeOrder();
    raw.metadata.chunks = [successChunk];
    expect(buildV2Order(raw).status).toBe(OrderStatus.Completed);
    expect(buildV2Order(makeOrder("completed")).status).toBe(OrderStatus.Completed);
  });

  it("prioritizes cancellation over expiry", () => {
    const raw = makeOrder();
    raw.metadata.description = "Cancelled by contract";
    expect(buildV2Order(raw).status).toBe(OrderStatus.Cancelled);
    expect(buildV2Order(makeOrder("cancelled")).status).toBe(OrderStatus.Cancelled);
  });

  it("returns the expired status in both history and single-order lookups", async () => {
    const raw = makeOrder();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ orders: [raw] }))));
    const orders = await getOrders({ getv1orders: false });
    const order = await getOrder({ orderId: raw.hash, chainId: 56 });
    expect(orders[0]?.status).toBe(OrderStatus.Expired);
    expect(order?.status).toBe(OrderStatus.Expired);
  });

  it("ends swap tracking when the service confirms failure after the deadline", async () => {
    const raw = makeOrder();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ orders: [raw] }))));
    const tracked = watchOrder({ order: buildV2Order(makeOrder("pending")) });
    expect((await tracked.next()).value).toMatchObject({ status: OrderStatus.Expired });
    await expect(tracked.next()).rejects.toMatchObject({ reason: "expired" });
  });

  it("continues tracking a pending order after the deadline until its fill is indexed", async () => {
    const pending = makeOrder("pending");
    const completed = makeOrder("completed");
    completed.metadata.chunks = [successChunk];
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ orders: [pending] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ orders: [completed] }))));
    const tracked = watchOrder({ order: buildV2Order(pending) });
    expect((await tracked.next()).value).toMatchObject({ status: OrderStatus.Open });
    const update = tracked.next();
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await update).value).toMatchObject({ status: OrderStatus.Completed });
    expect((await tracked.next()).done).toBe(true);
  });
});

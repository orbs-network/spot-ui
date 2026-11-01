import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateOrder,
  Module,
  OrderStatus,
  Partners,
  type Address,
  type PreparedOrder,
  type RePermitOrder,
  type SpotClient,
} from "@orbs-network/spot-ui";
import { Analytics } from "../../spot-ui/src/lib/analytics";
import { buildV2Order } from "../../spot-ui/src/lib/orders/v2-orders";
import type { OrderV2 } from "../../spot-ui/src/lib/types";
import { createSpotStore } from "../src/context/create-spot-store";
import { executeOrder } from "../src/execute-order";
import { ExecutionPhase, type Callbacks, type WalletInteractions } from "../src/types";
import { waitForSwapOrder } from "../src/wait-for-swap-order";

vi.mock("@orbs-network/spot-ui", async () => import("../../spot-ui/src/index"));

const account: Address = "0x0000000000000000000000000000000000000001";
const otherAccount: Address = "0x0000000000000000000000000000000000000002";
const inputAddress: Address = "0x0000000000000000000000000000000000000010";
const outputAddress: Address = "0x0000000000000000000000000000000000000020";
const adapter: Address = "0x0000000000000000000000000000000000000030";
const signature = "0x1234";
const now = 1_700_000_000_000;
const signingDuration = 180_000;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

let snapshots: Map<string, OrderV2>;

const makeSwap = ({
  id,
  signer = account,
  deadlineMillis = now + signingDuration,
  store = createSpotStore({}),
}: {
  id: string;
  signer?: Address;
  deadlineMillis?: number;
  store?: ReturnType<typeof createSpotStore>;
}) => {
  const form = calculateOrder({
    module: Module.SWAP,
    inputTokenDecimals: 0,
    outputTokenDecimals: 0,
    quotedOutputAmountRaw: "200",
    minimumOutputAmountRaw: "190",
    inputBalanceRaw: "1000",
    inputTokenUsdPrice: "1",
    outputTokenUsdPrice: "1",
    minTradeSizeUsd: 1,
    priceProtectionPercent: 5,
    userInput: { inputAmountUi: "100", isMarketOrder: false },
  });
  const deadline = String(deadlineMillis / 1000);
  const order: RePermitOrder = {
    permitted: { token: inputAddress, amount: "100" },
    spender: adapter,
    nonce: id,
    deadline,
    witness: {
      reactor: adapter,
      executor: adapter,
      exchange: { adapter, ref: adapter, share: 0, data: "0x" },
      swapper: signer,
      nonce: id,
      deadline,
      start: String(deadlineMillis / 1000 - 180),
      chainid: 56,
      exclusivity: 0,
      epoch: 0,
      slippage: 500,
      freshness: 60,
      input: { token: inputAddress, amount: "100", maxAmount: "100" },
      output: { token: outputAddress, limit: "190", recipient: signer },
    },
  };
  const preparedOrder: PreparedOrder = {
    order,
    approvalRequest: { tokenAddress: inputAddress, spenderAddress: adapter, amount: "100" },
    signingRequest: {
      signerAddress: signer,
      typedData: {
        domain: { name: "RePermit", version: "1", chainId: 56, verifyingContract: adapter },
        types: {},
        primaryType: "Order",
        message: order,
      },
    },
    form,
    values: { ...form.values, currentTimeMillis: now, deadlineMillis },
  };
  const rawOrder: OrderV2 = {
    hash: `0x${id}`,
    signature,
    timestamp: new Date(now).toISOString(),
    order,
    metadata: {
      status: "pending",
      description: "",
      expectedChunks: 1,
      chunks: [],
      lastPriceCheck: "",
      nextEligibleTime: "",
      displayOnlyInputTokenPriceUSD: "0",
      repermitDigest: "0x",
    },
  };
  const acceptedOrder = buildV2Order(rawOrder);
  snapshots.set(acceptedOrder.id, rawOrder);
  const signing = deferred<`0x${string}`>();
  const signOrder = vi.fn<WalletInteractions["signOrder"]>(() => signing.promise);
  const prepareOrder = vi.fn<SpotClient["prepareOrder"]>(() => preparedOrder);
  const submitOrder = vi.fn<SpotClient["submitOrder"]>().mockResolvedValue(acceptedOrder);
  const unusedClientOperation = () => { throw new Error("Unexpected client operation"); };
  const client: SpotClient = {
    analytics: new Analytics(true),
    partner: Partners.Pancake,
    chainId: 56,
    spenderAddress: adapter,
    exchangeAddress: adapter,
    rePermitData: { ...preparedOrder.signingRequest.typedData, order },
    getQuote: vi.fn<SpotClient["getQuote"]>().mockResolvedValue({
      request: {
        chainId: 56, partner: Partners.Pancake, inToken: inputAddress,
        outToken: outputAddress, inAmount: "100", user: signer, slippage: 0,
      },
      receivedAt: now,
      amountOut: "200",
      netAmountOut: "200",
      minimumAmountOut: "190",
      feeAmount: "0",
    }),
    prepareOrder,
    submitOrder,
    prepareSwap: unusedClientOperation,
    getCancelOrderRequest: unusedClientOperation,
    getOrder: unusedClientOperation,
    getAccountOrders: unusedClientOperation,
    getAccountOrdersResult: unusedClientOperation,
  };
  const walletInteractions: WalletInteractions = {
    getAllowance: vi.fn().mockResolvedValue("100"),
    approveToken: vi.fn().mockResolvedValue("0xapproval"),
    wrapNativeToken: vi.fn().mockResolvedValue("0xwrap"),
    cancelOrder: vi.fn().mockResolvedValue("0xcancel"),
    signOrder,
  };
  const callbacks = {
    onSignOrderError: vi.fn(),
    onSignOrderSuccess: vi.fn(),
    onOrderCreated: vi.fn(),
    onOrderFilled: vi.fn(),
    onSubmitOrderFailed: vi.fn(),
  } satisfies Callbacks;
  store.getState().configureOrders(JSON.stringify([signer, adapter, client.partner, 56, false]));
  const controller = new AbortController();
  const run = () => executeOrder({
    account: signer,
    chainId: 56,
    inputToken: { address: inputAddress, symbol: "IN", decimals: 0 },
    outputToken: { address: outputAddress, symbol: "OUT", decimals: 0 },
    form,
    client,
    walletInteractions,
    callbacks,
    signal: controller.signal,
    addNewOrder: store.getState().addOrder,
    refetchActiveOrders: vi.fn(),
    getCurrentExecution: () => store.getState().state.currentExecution,
    beginExecution: store.getState().beginExecution,
    replaceExecution: store.getState().replaceExecution,
    waitForOrderFill: (accepted, executionId) => waitForSwapOrder({
      store, callbacks, order: accepted, executionId, signal: controller.signal,
    }),
  });
  const complete = () => {
    snapshots.set(acceptedOrder.id, {
      ...rawOrder,
      metadata: { ...rawOrder.metadata, status: "completed" },
    });
  };
  return {
    store, run, signing, signOrder, prepareOrder, preparedOrder,
    submitOrder, acceptedOrder, callbacks, complete,
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  snapshots = new Map();
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const order = snapshots.get(url.searchParams.get("hash") ?? "");
    return new Response(JSON.stringify({ orders: order ? [order] : [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("swap execution concurrency", () => {
  it.each([ExecutionPhase.SIGNING, ExecutionPhase.SETTLING])(
    "keeps another widget %s when the first signing attempt expires",
    async (otherPhase) => {
      const first = makeSwap({ id: "first" });
      const second = makeSwap({ id: "second", signer: otherAccount, deadlineMillis: now + signingDuration * 2 });
      const firstPending = first.run();
      const firstExpired = expect(firstPending).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
      const secondPending = second.run();
      await vi.advanceTimersByTimeAsync(0);
      if (otherPhase === ExecutionPhase.SETTLING) {
        second.signing.resolve(signature);
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(second.store.getState().state.currentExecution.phase).toBe(otherPhase);

      await vi.advanceTimersByTimeAsync(signingDuration + 1);
      await firstExpired;
      expect(first.store.getState().state.currentExecution).toMatchObject({
        phase: ExecutionPhase.FAILED,
        parsedError: { code: "ORDER_EXPIRED" },
      });
      expect(second.store.getState().state.currentExecution.phase).toBe(otherPhase);
      expect(second.callbacks.onSubmitOrderFailed).not.toHaveBeenCalled();

      // Neither a stale wallet signature nor its old timer may change widget two.
      first.signing.resolve("0xstale");
      second.signing.resolve(signature);
      second.complete();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(secondPending).resolves.toMatchObject({ id: second.acceptedOrder.id, status: OrderStatus.Completed });
      expect(first.submitOrder).not.toHaveBeenCalled();
      expect(second.callbacks.onOrderFilled).toHaveBeenCalledOnce();
      expect(second.store.getState().orders.data).toEqual([expect.objectContaining({
        id: second.acceptedOrder.id, status: OrderStatus.Completed,
      })]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["first", "second"] as const)(
    "tracks two accepted widgets independently when %s completes first",
    async (firstCompleted) => {
      const first = makeSwap({ id: "first" });
      const second = makeSwap({ id: "second" });
      const pending = { first: first.run(), second: second.run() };
      first.signing.resolve(signature);
      second.signing.resolve(signature);
      await vi.advanceTimersByTimeAsync(0);
      expect(first.store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SETTLING);
      expect(second.store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SETTLING);

      const done = firstCompleted === "first" ? first : second;
      const waiting = firstCompleted === "first" ? second : first;
      done.complete();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending[firstCompleted]).resolves.toMatchObject({ id: done.acceptedOrder.id, status: OrderStatus.Completed });
      expect(waiting.store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SETTLING);
      expect(waiting.callbacks.onOrderFilled).not.toHaveBeenCalled();
      expect(waiting.store.getState().orders.data).toEqual([expect.objectContaining({
        id: waiting.acceptedOrder.id, status: OrderStatus.Open,
      })]);

      waiting.complete();
      await vi.advanceTimersByTimeAsync(2_000);
      await Promise.all(Object.values(pending));
      expect(first.callbacks.onOrderFilled).toHaveBeenCalledOnce();
      expect(second.callbacks.onOrderFilled).toHaveBeenCalledOnce();
      expect(first.store.getState().state.currentExecution.orderId).toBe(first.acceptedOrder.id);
      expect(second.store.getState().state.currentExecution.orderId).toBe(second.acceptedOrder.id);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([ExecutionPhase.SIGNING, ExecutionPhase.SETTLING])(
    "ignores repeated submits in one widget during %s",
    async (phase) => {
      const swap = makeSwap({ id: "original" });
      const pending = swap.run();
      await vi.advanceTimersByTimeAsync(0);
      if (phase === ExecutionPhase.SETTLING) {
        swap.signing.resolve(signature);
        await vi.advanceTimersByTimeAsync(0);
      }
      const original = swap.store.getState().state.currentExecution;
      expect(original.phase).toBe(phase);

      await expect(swap.run()).resolves.toBeUndefined();
      expect(swap.store.getState().state.currentExecution).toBe(original);
      expect(swap.signOrder).toHaveBeenCalledOnce();
      const executionId = swap.store.getState().state.currentExecution.executionId;
      expect(swap.store.getState().returnToOrderForm(executionId)).toBe(false);
      expect(swap.store.getState().startNewOrder({}, executionId)).toBe(false);

      swap.signing.resolve(signature);
      swap.complete();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending).resolves.toMatchObject({ status: OrderStatus.Completed });
      expect(swap.submitOrder).toHaveBeenCalledOnce();
      expect(swap.callbacks.onOrderCreated).toHaveBeenCalledOnce();
      expect(swap.callbacks.onOrderFilled).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["resolve", "reject"] as const)(
    "keeps a retry current after an expired wallet later %ss",
    async (lateResult) => {
      const first = makeSwap({ id: "expired" });
      const firstPending = first.run();
      const expired = expect(firstPending).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
      await vi.advanceTimersByTimeAsync(signingDuration + 1);
      await expired;
      const expiredExecution = first.store.getState().state.currentExecution;
      const retry = makeSwap({ id: "retry", store: first.store, deadlineMillis: now + signingDuration * 2 });
      const retryPending = retry.run();
      await vi.advanceTimersByTimeAsync(0);
      const retryExecution = retry.store.getState().state.currentExecution;
      expect(retryExecution.phase).toBe(ExecutionPhase.SIGNING);
      expect(retryExecution.executionId).not.toBe(expiredExecution.executionId);

      if (lateResult === "resolve") first.signing.resolve("0xstale");
      else first.signing.reject(new Error("Late rejection from the expired wallet"));
      await vi.advanceTimersByTimeAsync(0);
      expect(first.store.getState().state.currentExecution).toBe(retryExecution);
      expect(first.submitOrder).not.toHaveBeenCalled();
      expect(retry.callbacks.onSignOrderError).not.toHaveBeenCalled();

      // Both old completion and old failure updates must respect attempt identity.
      for (const phase of [ExecutionPhase.SUCCESS, ExecutionPhase.FAILED]) {
        expect(first.store.getState().replaceExecution(expiredExecution.executionId!, {
          ...expiredExecution, phase,
        })).toBe(false);
      }
      expect(first.store.getState().state.currentExecution).toBe(retryExecution);
      retry.signing.resolve(signature);
      retry.complete();
      await vi.advanceTimersByTimeAsync(0);
      await expect(retryPending).resolves.toMatchObject({ id: retry.acceptedOrder.id, status: OrderStatus.Completed });
      expect(retry.submitOrder).toHaveBeenCalledOnce();
      expect(retry.callbacks.onOrderFilled).toHaveBeenCalledOnce();
      expect(first.store.getState().state.currentExecution).toMatchObject({
        phase: ExecutionPhase.SUCCESS, executionId: retryExecution.executionId, orderId: retry.acceptedOrder.id,
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

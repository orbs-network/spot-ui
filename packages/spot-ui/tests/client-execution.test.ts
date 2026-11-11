import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createClient, type AllowanceRequest, type PreparedOrder, type SpotClient } from "../src/lib/client";
import { MAX_UINT_256 } from "../src/lib/evm-constants";
import type { OrderExecutionUpdate } from "../src/index";
import type { PreparedSwap } from "../src/lib/swap";
import { createAnalytics, getClientAnalytics } from "../src/internal";
import { getOrderAnalytics, getSubmittedOrderAnalytics } from "../src/lib/analytics";
import type { OrderWalletInteractions } from "../src/lib/execute-order";
import { fetchRePermitData } from "../src/lib/fetch-repermit-data";
import { calculateOrder } from "../src/lib/order-form/calculate-order-form";
import { getOrders } from "../src/lib/orders";
import { buildV2Order, getOrder } from "../src/lib/orders/v2-orders";
import { fetchQuote, type SwapQuote } from "../src/lib/quote";
import { submitOrder } from "../src/lib/submit-order";
import { OrderType, OrderStatus, OrderVariant, Partners, TimeUnit, type Order, type RePermitData, type RePermitOrder } from "../src/lib/types";

vi.mock("../src/lib/fetch-repermit-data", () => ({ fetchRePermitData: vi.fn() }));
vi.mock("../src/lib/submit-order", () => ({ submitOrder: vi.fn() }));
vi.mock("../src/lib/orders/v2-orders", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/orders/v2-orders")>(),
  getOrder: vi.fn(),
}));
vi.mock("../src/lib/quote", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/quote")>(),
  fetchQuote: vi.fn(),
}));

const account = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const inputTokenAddress = "0x1111111111111111111111111111111111111111";
const outputTokenAddress = "0x2222222222222222222222222222222222222222";
const spender = "0x3333333333333333333333333333333333333333";
const adapter = "0x4444444444444444444444444444444444444444";
const signature = "0x1234";
const initialTime = new Date("2030-01-01T00:00:00Z").getTime();
const acceptedOrders = new Map<string, Order>();

const acceptedOrder = (order: RePermitOrder): Order => {
  const accepted = buildV2Order({
    hash: `0xaccepted-${order.nonce}`,
    order,
    signature,
    timestamp: new Date().toISOString(),
    metadata: {
      expectedChunks: Number(order.witness.input.maxAmount) / Number(order.witness.input.amount),
      lastPriceCheck: "", nextEligibleTime: "", status: "pending", description: "",
      displayOnlyInputTokenPriceUSD: "", repermitDigest: "0xdigest",
    },
  });
  acceptedOrders.set(accepted.id, accepted);
  return accepted;
};

const completedOrder = (order: Order): Order => ({
  ...order, status: OrderStatus.Completed, progress: 100,
});

const configuration = (): RePermitData => ({
  domain: { name: "RePermit", version: "1", chainId: 137, verifyingContract: spender },
  primaryType: "Order",
  types: {},
  order: {
    permitted: { token: inputTokenAddress, amount: "0" },
    spender,
    nonce: "0",
    deadline: "0",
    witness: {
      reactor: spender, executor: spender,
      exchange: { adapter, ref: adapter, share: 0, data: "0x" },
      swapper: account, nonce: "0", deadline: "0", chainid: 137,
      exclusivity: 0, epoch: 0, slippage: 0, freshness: 0,
      input: { token: inputTokenAddress, amount: "0", maxAmount: "0" },
      output: { token: outputTokenAddress, limit: "0", recipient: account },
    },
  },
});

const quote = (): SwapQuote => ({
  request: {
    chainId: 137, partner: Partners.Quick, inToken: inputTokenAddress,
    outToken: outputTokenAddress, inAmount: "10", user: account, slippage: 0.5,
  },
  receivedAt: Date.now(), amountOut: "20", netAmountOut: "20",
  minimumAmountOut: "18", feeAmount: "0",
});

const form = (orderType = OrderType.LIMIT) => calculateOrder({
  orderType,
  inputTokenDecimals: 0, outputTokenDecimals: 0,
  quotedOutputAmountRaw: "20",
  inputBalanceRaw: "100", inputTokenUsdPrice: "1", outputTokenUsdPrice: "1",
  minTradeSizeUsd: 1, priceProtectionPercent: 5,
  userInput: { inputAmountUi: "10", isMarketOrder: orderType !== OrderType.LIMIT, limitPriceUi: "2", tradeCount: 2 },
});

const wallet = () => {
  const interactions = {
    shouldWrap: vi.fn<OrderWalletInteractions["shouldWrap"]>().mockReturnValue(false),
    wrapNativeToken: vi.fn<OrderWalletInteractions["wrapNativeToken"]>().mockResolvedValue("0x11"),
    shouldApprove: vi.fn<OrderWalletInteractions["shouldApprove"]>().mockReturnValue(false),
    approveToken: vi.fn<OrderWalletInteractions["approveToken"]>(),
    signOrder: vi.fn<OrderWalletInteractions["signOrder"]>().mockResolvedValue(signature),
  };
  interactions.approveToken.mockImplementation(async () => {
    interactions.shouldApprove.mockReturnValue(false);
    return "0x22";
  });
  return interactions;
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

const interceptSubmission = async () => {
  const actual = await vi.importActual<typeof import("../src/lib/submit-order")>("../src/lib/submit-order");
  vi.mocked(submitOrder).mockImplementation(actual.submitOrder);
  const started = deferred<{ order: RePermitOrder; signal: AbortSignal }>();
  const response = deferred<Response>();
  const fetchRequest = vi.fn<typeof fetch>((_request, options) => {
    const signal = options?.signal;
    if (!signal) throw new Error("Submission must retain its bounded request signal");
    const body = JSON.parse(String(options.body)) as { order: RePermitOrder };
    started.resolve({ order: body.order, signal });
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
      void response.promise.then(value => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      });
    });
  });
  vi.stubGlobal("fetch", fetchRequest);
  return { started, response, fetchRequest };
};

const client = (apiUrl?: string) => createClient(Partners.Quick, 137, { disableAnalytics: true, apiUrl });
type PublicUpdate = OrderExecutionUpdate<PreparedOrder | PreparedSwap>;
type Method = "swap" | "order";
const execution = (kind: Method, spot: SpotClient, interactions = wallet()) => kind === "swap"
  ? spot.createSwapExecution({ quote: quote(), account, walletInteractions: interactions })
  : spot.createOrderExecution({ form: form(), inputTokenAddress, outputTokenAddress, account, walletInteractions: interactions });

describe("client execution sessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(initialTime);
    vi.resetAllMocks();
    acceptedOrders.clear();
    vi.mocked(fetchRePermitData).mockResolvedValue(configuration());
    vi.mocked(fetchQuote).mockImplementation(async () => quote());
    vi.mocked(submitOrder).mockImplementation(async order => acceptedOrder(order));
    vi.mocked(getOrder).mockImplementation(async ({ orderId }) => {
      const accepted = acceptedOrders.get(orderId);
      return accepted && completedOrder(accepted);
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("uses the exact partner value for configured history on both order services", async () => {
    const spot = await client();
    const fetchRequest = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({ orders: [] }),
    );
    vi.stubGlobal("fetch", fetchRequest);

    await expect(spot.getOrders({ account, legacyOrders: false }))
      .resolves.toEqual({ orders: [], legacyLoaded: false });

    const requests = fetchRequest.mock.calls.map(([request]) => new URL(String(request)));
    expect(requests.map(request => request.origin)).toEqual([
      "https://order-sink-v2.orbs.network",
      "https://order-sink.orbs.network",
    ]);
    for (const request of requests) {
      expect(Object.fromEntries(request.searchParams)).toEqual({
        chainId: "137", swapper: account, exchange: "quick",
      });
    }
  });

  it.each([Partners.Quick, Partners.Pancake])("preserves %s in standalone history filters", async exchange => {
    const fetchRequest = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({ orders: [] }),
    );
    vi.stubGlobal("fetch", fetchRequest);

    await expect(getOrders({ exchange })).resolves.toEqual([]);

    expect(fetchRequest).toHaveBeenCalledTimes(2);
    for (const [request] of fetchRequest.mock.calls) {
      expect(new URL(String(request)).searchParams.get("exchange")).toBe(exchange);
    }
  });

  it("creates and snapshots both intents without reading or opening the wallet", async () => {
    const spot = await client();
    const interactions = wallet();
    const reviewedForm = form();
    const reviewedQuote = quote();
    const advanced = spot.createOrderExecution({ form: reviewedForm, inputTokenAddress, outputTokenAddress, account, walletInteractions: interactions });
    const swap = spot.createSwapExecution({ quote: reviewedQuote, account, walletInteractions: interactions });
    reviewedForm.values.minOutputAmountPerTrade = "1";
    reviewedForm.values.inputAmount = "999";
    reviewedQuote.minimumAmountOut = "1";
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    await advanced.run();
    expect(advanced.preparedOrder?.order.witness.output.limit).toBe("20");
    expect(advanced.preparedOrder?.order.permitted.amount).toBe("10");
    await swap.run();
    expect(swap.preparedOrder?.order.witness.output.limit).toBe("18");
  });

  it.each(["swap", "order"] as const)("exposes readonly prerequisite queries on the public %s execution", async kind => {
    const spot = await client();
    const interactions = wallet();
    const session = execution(kind, spot, interactions);
    await expect(session.shouldWrap()).resolves.toBe(false);
    await expect(session.shouldApprove()).resolves.toBe(false);
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    await session.sign();
    await session.submit();
    expect(session.order?.status).toBe(OrderStatus.Open);
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    session.cancel();
  });

  it("allows an advanced order while the same account's swap is still settling", async () => {
    const spot = await client();
    const first = spot.createSwapExecution({ quote: quote(), account, walletInteractions: wallet() });
    const polling = deferred<void>();
    const settlement = deferred<Order>();
    vi.mocked(getOrder).mockImplementationOnce(() => { polling.resolve(); return settlement.promise; });
    const pending = first.run();
    await polling.promise;
    const originalSwap = first.order!;
    const advanced = execution("order", spot);
    const created = await advanced.run();
    expect(created.status).toBe(OrderStatus.Open);
    expect(first.order).toBe(originalSwap);
    expect(first.order?.status).toBe(OrderStatus.Open);
    expect(advanced.preparedOrder?.order.nonce).not.toBe(first.preparedOrder?.order.nonce);
    settlement.resolve(completedOrder(originalSwap as Order));
    await pending;
    expect(first.order?.status).toBe(OrderStatus.Completed);
    expect(advanced.order).toBe(created);
    expect(advanced.order?.status).toBe(OrderStatus.Open);
    expect(submitOrder).toHaveBeenCalledTimes(2);
  });

  it.each(["swap", "order"] as const)("rejects native input in the %s constructor before wallet work", async kind => {
    const spot = await client();
    const interactions = wallet();
    const native = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const create = () => kind === "swap"
      ? spot.createSwapExecution({ quote: { ...quote(), request: { ...quote().request, inToken: native } }, account, walletInteractions: interactions })
      : spot.createOrderExecution({ form: form(), inputTokenAddress: native, outputTokenAddress, account, walletInteractions: interactions });
    expect(create).toThrow(/wrapped|ERC.?20|native|input/i);
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each([false, true])("keeps the swap count unknown until fresh allowance skips approval (initial=%s)", async initialRequired => {
    const spot = await client();
    const interactions = wallet();
    const initialDecision = deferred<boolean>();
    const freshDecision = deferred<boolean>();
    const initialChecking = deferred<void>();
    const freshChecking = deferred<void>();
    const pendingSignature = deferred<`0x${string}`>();
    const signing = deferred<void>();
    interactions.shouldApprove
      .mockImplementationOnce(() => { initialChecking.resolve(); return initialDecision.promise; })
      .mockImplementationOnce(() => { freshChecking.resolve(); return freshDecision.promise; });
    interactions.signOrder.mockImplementation(() => { signing.resolve(); return pendingSignature.promise; });
    const session = execution("swap", spot, interactions);
    const updates: PublicUpdate[] = [];
    const running = session.run({ onProgress: update => { updates.push(update); } });
    await initialChecking.promise;
    initialDecision.resolve(initialRequired);
    await freshChecking.promise;
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.every(update => update.phase === "preparing" && update.steps.length === 0)).toBe(true);
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    freshDecision.resolve(false);
    await signing.promise;
    expect(updates.find(update => update.steps.length > 0)).toMatchObject({ phase: "signing", event: "request", steps: ["create"] });
    expect(updates.filter(update => update.steps.length > 0).every(update => update.steps.join() === "create")).toBe(true);
    pendingSignature.resolve(signature);
    await expect(running).resolves.toMatchObject({ status: OrderStatus.Completed });
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).toHaveBeenCalledOnce();
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it.each(["swap", "order"] as const)("rechecks allowance after approving only the reviewed %s amount", async kind => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldApprove.mockReturnValue(true);
    const session = execution(kind, spot, interactions);
    await session.run();
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    const request = { tokenAddress: inputTokenAddress, amount: "10", approvalAmount: MAX_UINT_256, spenderAddress: spender };
    expect(interactions.shouldApprove.mock.calls).toEqual([[request], [request], [request]]);
    expect(interactions.approveToken).toHaveBeenCalledExactlyOnceWith(request);
    expect(session.approvalTxHash).toBe("0x22");
    expect(session.wrapTxHash).toBeUndefined();
  });

  it("keeps allowance reader inputs limited to the token and spender", () => {
    expectTypeOf<keyof AllowanceRequest>().toEqualTypeOf<"tokenAddress" | "spenderAddress">();
    const request: AllowanceRequest = { tokenAddress: inputTokenAddress, spenderAddress: spender };
    expect(request).toEqual({ tokenAddress: inputTokenAddress, spenderAddress: spender });
  });

  it.each([
    ["swap", "default"], ["order", "default"], ["swap", "exact"], ["order", "exact"],
  ] as const)("suggests max approval for %s while supporting the host's %s cap without changing signed spending", async (kind, cap) => {
    const spot = await client();
    const interactions = wallet();
    let allowance = BigInt(0);
    let transactionApproval: string | undefined;
    interactions.shouldApprove.mockImplementation(request => {
      expect(request.amount).toBe("10");
      expect(request.approvalAmount).toBe(MAX_UINT_256);
      expect(Object.isFrozen(request)).toBe(true);
      return allowance < BigInt(request.amount);
    });
    interactions.approveToken.mockImplementation(async request => {
      expect(Object.isFrozen(request)).toBe(true);
      expect(Reflect.set(request, "approvalAmount", "1")).toBe(false);
      transactionApproval = cap === "exact" ? request.amount : request.approvalAmount;
      allowance = BigInt(transactionApproval);
      return "0x22";
    });
    const session = execution(kind, spot, interactions);
    await session.run();

    expect(transactionApproval).toBe(cap === "exact" ? "10" : MAX_UINT_256);
    expect(interactions.approveToken).toHaveBeenCalledOnce();
    expect(interactions.shouldApprove).toHaveBeenCalledTimes(3);
    expect(session.preparedOrder?.approvalRequest).toEqual({
      tokenAddress: inputTokenAddress, spenderAddress: spender, amount: "10", approvalAmount: MAX_UINT_256,
    });
    expect(session.preparedOrder?.order.permitted.amount).toBe("10");
    expect(session.preparedOrder?.order.witness.input.maxAmount).toBe("10");
    expect(interactions.signOrder.mock.calls[0]![0].typedData.message.permitted.amount).toBe("10");
    expect(Object.isFrozen(session.preparedOrder?.approvalRequest)).toBe(true);
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it.each(["swap", "order"] as const)("skips %s approval when exact required allowance is available despite the max suggestion", async kind => {
    const spot = await client();
    const interactions = wallet();
    const allowance = BigInt(10);
    interactions.shouldApprove.mockImplementation(request => allowance < BigInt(request.amount));
    const session = execution(kind, spot, interactions);
    await session.run();

    expect(interactions.shouldApprove).toHaveBeenCalledTimes(2);
    expect(interactions.shouldApprove.mock.calls[0]![0]).toMatchObject({ amount: "10", approvalAmount: MAX_UINT_256 });
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).toHaveBeenCalledOnce();
    expect(session.preparedOrder?.order.permitted.amount).toBe("10");
  });

  it.each(["swap", "order"] as const)("retries %s approval once when the first confirmed transaction leaves insufficient allowance", async kind => {
    const spot = await client();
    const interactions = wallet();
    let confirmations = 0;
    interactions.shouldApprove.mockImplementation(() => confirmations < 2);
    interactions.approveToken.mockImplementation(async () => ++confirmations === 1 ? "0x22" : "0x33");
    const session = execution(kind, spot, interactions);
    const updates: PublicUpdate[] = [];
    const running = session.run({ onProgress: update => { updates.push(update); } });
    expect(session.run()).toBe(running);
    await running;

    const request = { tokenAddress: inputTokenAddress, amount: "10", approvalAmount: MAX_UINT_256, spenderAddress: spender };
    expect(interactions.approveToken.mock.calls).toEqual([[request], [request]]);
    expect(interactions.shouldApprove.mock.calls).toEqual([[request], [request], [request], [request]]);
    expect(session.approvalTxHash).toBe("0x33");
    const approvals = updates.filter(update => update.phase === "approving");
    expect(approvals.filter(update => update.event === "request")).toHaveLength(2);
    expect(approvals.filter(update => update.event === "transaction")).toMatchObject([
      { approvalTxHash: "0x22", hasApproval: false, stepIndex: 0 },
      { approvalTxHash: "0x33", hasApproval: false, stepIndex: 0 },
    ]);
    expect(approvals.filter(update => update.event === "success")).toMatchObject([
      { approvalTxHash: "0x33", hasApproval: true, stepIndex: 1 },
    ]);
    await expect(session.shouldApprove()).resolves.toBe(false);
    expect(interactions.shouldApprove).toHaveBeenCalledTimes(4);
    expect(interactions.signOrder).toHaveBeenCalledOnce();
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it.each(["swap", "order"] as const)("stops %s after two confirmed approvals still leave insufficient allowance", async kind => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldApprove.mockReturnValue(true);
    interactions.approveToken.mockResolvedValueOnce("0x22").mockResolvedValueOnce("0x33");
    const session = execution(kind, spot, interactions);
    const updates: PublicUpdate[] = [];
    const running = session.run({ onProgress: update => { updates.push(update); } });
    await expect(running).rejects.toMatchObject({ code: "INSUFFICIENT_ALLOWANCE" });
    expect(session.run()).toBe(running);
    await expect(session.approve()).rejects.toMatchObject({ code: "INSUFFICIENT_ALLOWANCE" });
    await expect(session.sign()).rejects.toMatchObject({ code: "INSUFFICIENT_ALLOWANCE" });

    expect(interactions.approveToken).toHaveBeenCalledTimes(2);
    expect(interactions.shouldApprove).toHaveBeenCalledTimes(4);
    expect(session.approvalTxHash).toBe("0x33");
    const approvals = updates.filter(update => update.phase === "approving");
    expect(approvals.filter(update => update.event === "transaction").map(update => update.approvalTxHash)).toEqual(["0x22", "0x33"]);
    expect(approvals.filter(update => update.event === "success")).toEqual([]);
    expect(approvals[approvals.length - 1]).toMatchObject({ event: "error", hasApproval: false, stepIndex: 0, approvalTxHash: "0x33" });
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
    expect(session.preparedOrder).toBeUndefined();
  });

  it.each(["swap", "order"] as const)("shares an in-flight manual %s approval across its retry", async kind => {
    const spot = await client();
    const interactions = wallet();
    const firstReceipt = deferred<`0x${string}`>();
    const approving = deferred<void>();
    let confirmations = 0;
    interactions.shouldApprove.mockImplementation(() => confirmations < 2);
    interactions.approveToken
      .mockImplementationOnce(() => {
        approving.resolve();
        return firstReceipt.promise.then(hash => { confirmations += 1; return hash; });
      })
      .mockImplementationOnce(async () => { confirmations += 1; return "0x33"; });
    const session = execution(kind, spot, interactions);
    await session.wrap();
    const first = session.approve();
    await approving.promise;
    expect(session.approve()).toBe(first);
    expect(interactions.signOrder).not.toHaveBeenCalled();
    firstReceipt.resolve("0x22");
    await expect(first).resolves.toEqual({ status: "success", txHash: "0x33" });
    expect(session.approve()).toBe(first);
    expect(interactions.approveToken).toHaveBeenCalledTimes(2);
    expect(interactions.shouldApprove).toHaveBeenCalledTimes(3);
    await session.sign();
    await session.submit();
    expect(interactions.signOrder).toHaveBeenCalledOnce();
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it.each(["swap", "order"] as const)("retains a confirmed %s approval but stops when cancelled before its allowance recheck", async kind => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldApprove.mockReturnValue(true);
    const reason = new Error("Wallet changed after approval confirmation");
    const session = execution(kind, spot, interactions);
    const updates: PublicUpdate[] = [];
    await expect(session.run({ onProgress: update => {
      updates.push(update);
      if (update.phase === "approving" && update.event === "transaction") session.cancel(reason);
    } })).rejects.toBe(reason);

    expect(session.approvalTxHash).toBe("0x22");
    expect(interactions.approveToken).toHaveBeenCalledOnce();
    expect(interactions.shouldApprove).toHaveBeenCalledTimes(2);
    expect(updates.filter(update => update.phase === "approving" && update.event === "success")).toEqual([]);
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each(["swap", "order"] as const)("does not retry %s approval when cancelled during the receipt's allowance recheck", async kind => {
    const spot = await client();
    const interactions = wallet();
    const checking = deferred<void>();
    const allowance = deferred<boolean>();
    interactions.shouldApprove.mockReturnValueOnce(true).mockReturnValueOnce(true)
      .mockImplementationOnce(() => { checking.resolve(); return allowance.promise; });
    interactions.approveToken.mockResolvedValue("0x22");
    const session = execution(kind, spot, interactions);
    const running = session.run();
    const reason = new Error("Wallet changed during the allowance recheck");
    const cancelled = expect(running).rejects.toBe(reason);
    await checking.promise;
    expect(session.approvalTxHash).toBe("0x22");
    session.cancel(reason);
    await cancelled;
    allowance.resolve(true);
    await Promise.resolve();

    expect(interactions.approveToken).toHaveBeenCalledOnce();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["swap", "rejects"], ["order", "rejects"], ["swap", "invalid"], ["order", "invalid"],
  ] as const)("does not retry %s approval when its confirmed-receipt allowance check %s", async (kind, failure) => {
    const spot = await client();
    const interactions = wallet();
    const readError = new Error("Allowance RPC is unavailable");
    let reads = 0;
    interactions.shouldApprove.mockImplementation(() => {
      if (++reads <= 2) return true;
      if (failure === "rejects") return Promise.reject(readError);
      return "true" as never;
    });
    interactions.approveToken.mockResolvedValue("0x22");
    const session = execution(kind, spot, interactions);
    const running = session.run();
    if (failure === "rejects") await expect(running).rejects.toBe(readError);
    else await expect(running).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });

    expect(session.approvalTxHash).toBe("0x22");
    expect(interactions.shouldApprove).toHaveBeenCalledTimes(3);
    expect(interactions.approveToken).toHaveBeenCalledOnce();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each([true, false])("awaits shouldWrap=%s before any transaction callback", async decision => {
    const spot = await client();
    const interactions = wallet();
    const pendingDecision = deferred<boolean>();
    const started = deferred<void>();
    interactions.shouldWrap.mockImplementation(() => { started.resolve(); return pendingDecision.promise; });
    const result = execution("swap", spot, interactions).run();
    await started.promise;
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.shouldApprove).toHaveBeenCalledOnce();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    pendingDecision.resolve(decision);
    await result;
    expect(interactions.wrapNativeToken).toHaveBeenCalledTimes(decision ? 1 : 0);
    expect(interactions.shouldApprove).toHaveBeenCalledTimes(decision ? 1 : 2);
  });

  it.each([
    ["swap", true], ["swap", false], ["order", true], ["order", false],
  ] as const)("checks %s allowance before wrapping and reuses approvalRequired=%s after confirmation", async (kind, approvalRequired) => {
    const spot = await client();
    const interactions = wallet();
    const allowance = deferred<boolean>();
    const checking = deferred<void>();
    const wrapReceipt = deferred<`0x${string}`>();
    const wrapping = deferred<void>();
    const approvalReceipt = deferred<`0x${string}`>();
    const approving = deferred<void>();
    const signing = deferred<void>();
    interactions.shouldWrap.mockReturnValue(true);
    interactions.shouldApprove.mockImplementationOnce(() => { checking.resolve(); return allowance.promise; });
    interactions.wrapNativeToken.mockImplementation(() => { wrapping.resolve(); return wrapReceipt.promise; });
    interactions.approveToken.mockImplementation(() => { approving.resolve(); return approvalReceipt.promise; });
    interactions.signOrder.mockImplementation(async () => { signing.resolve(); return signature; });
    const session = execution(kind, spot, interactions);
    const updates: PublicUpdate[] = [];
    const running = session.run({ onProgress: update => { updates.push(update); } });

    await checking.promise;
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.every(update => update.phase === "preparing" && update.steps.length === 0)).toBe(true);
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();

    allowance.resolve(approvalRequired);
    await wrapping.promise;
    expect(updates.find(update => update.steps.length > 0)).toMatchObject({
      phase: "wrapping", event: "request", steps: approvalRequired ? ["wrap", "approve", "create"] : ["wrap", "create"],
    });
    expect(interactions.shouldApprove).toHaveBeenCalledOnce();
    expect(interactions.approveToken).not.toHaveBeenCalled();

    wrapReceipt.resolve("0x11");
    await (approvalRequired ? approving.promise : signing.promise);
    expect(interactions.shouldApprove).toHaveBeenCalledOnce();
    if (approvalRequired) {
      expect(interactions.signOrder).not.toHaveBeenCalled();
      approvalReceipt.resolve("0x22");
    }
    await running;

    expect(interactions.shouldApprove).toHaveBeenCalledTimes(approvalRequired ? 2 : 1);
    expect(interactions.approveToken).toHaveBeenCalledTimes(approvalRequired ? 1 : 0);
    expect(interactions.wrapNativeToken).toHaveBeenCalledExactlyOnceWith("10");
    expect(interactions.signOrder).toHaveBeenCalledOnce();
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it.each(["swap", "order"] as const)("stops %s before wrapping when the initial allowance read fails", async kind => {
    const spot = await client();
    const interactions = wallet();
    const failure = new Error("Allowance RPC is unavailable");
    interactions.shouldWrap.mockReturnValue(true);
    interactions.shouldApprove.mockRejectedValue(failure);
    await expect(execution(kind, spot, interactions).run()).rejects.toBe(failure);
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each(["swap", "order"] as const)("does not wrap %s after cancellation during the initial allowance read", async kind => {
    const spot = await client();
    const interactions = wallet();
    const allowance = deferred<boolean>();
    const checking = deferred<void>();
    interactions.shouldWrap.mockReturnValue(true);
    interactions.shouldApprove.mockImplementation(() => { checking.resolve(); return allowance.promise; });
    const session = execution(kind, spot, interactions);
    const running = session.run();
    const reason = new Error("Wallet changed while checking allowance");
    const cancelled = expect(running).rejects.toBe(reason);
    await checking.promise;
    session.cancel(reason);
    await cancelled;
    allowance.resolve(true);
    await Promise.resolve();
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("waits for confirmed wrapping before writing approval and rechecks allowance after its receipt", async () => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldWrap.mockReturnValue(true);
    interactions.shouldApprove.mockReturnValue(true);
    const confirmation = deferred<`0x${string}`>();
    const started = deferred<void>();
    interactions.wrapNativeToken.mockImplementation(() => { started.resolve(); return confirmation.promise; });
    const result = execution("swap", spot, interactions).run();
    await started.promise;
    expect(interactions.shouldApprove).toHaveBeenCalledOnce();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    confirmation.resolve("0x11");
    await result;
    expect(interactions.shouldApprove).toHaveBeenCalledTimes(2);
    expect(interactions.approveToken).toHaveBeenCalledOnce();
  });

  it.each(["swap", "order"] as const)("keeps manual %s approval fresh after wrapping and an earlier allowance preview", async kind => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldWrap.mockReturnValue(true);
    const session = execution(kind, spot, interactions);
    await session.wrap();
    expect(interactions.shouldApprove).not.toHaveBeenCalled();
    await expect(session.shouldApprove()).resolves.toBe(false);
    interactions.shouldApprove.mockReturnValue(true);
    await expect(session.approve()).resolves.toEqual({ status: "success", txHash: "0x22" });
    expect(interactions.shouldApprove).toHaveBeenCalledTimes(3);
    expect(interactions.approveToken).toHaveBeenCalledOnce();
  });

  it.each([undefined, null, "", "0x", 1, false])("rejects an invalid wrap callback result (%s)", async result => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldWrap.mockReturnValue(true);
    interactions.wrapNativeToken.mockResolvedValue(result as never);
    await expect(execution("swap", spot, interactions).run()).rejects.toMatchObject({ code: "WRAP_FAILED" });
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", "0x", 1, false])("rejects an invalid approval callback result (%s)", async result => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldApprove.mockReturnValue(true);
    interactions.approveToken.mockResolvedValue(result as never);
    await expect(execution("swap", spot, interactions).run()).rejects.toMatchObject({ code: "APPROVAL_FAILED" });
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each(["swap", "order"] as const)("ignores removed context, balance-reader, and prior-wrap properties on %s inputs", async kind => {
    const spot = await client();
    const validateContext = vi.fn(() => { throw new Error("Removed callback must not run"); });
    const legacyBalanceReader = vi.fn(() => { throw new Error("Removed balance reader must not run"); });
    // A wider JavaScript adapter may still carry this removed field.
    const interactions = { ...wallet(), getTokenBalance: legacyBalanceReader };
    interactions.shouldWrap.mockReturnValue(true);
    interactions.wrapNativeToken.mockResolvedValue("0x11");
    const extra = { account, walletInteractions: interactions, validateContext, completedWrapTxHash: "0xprevious" };
    const session = kind === "swap"
      ? spot.createSwapExecution({ ...extra, quote: quote() })
      : spot.createOrderExecution({ ...extra, form: form(), inputTokenAddress, outputTokenAddress });
    expect(session.wrapTxHash).toBeUndefined();
    await session.run();
    expect(validateContext).not.toHaveBeenCalled();
    expect(legacyBalanceReader).not.toHaveBeenCalled();
    expect(interactions.wrapNativeToken).toHaveBeenCalledExactlyOnceWith("10");
    expect(session.wrapTxHash).toBe("0x11");
  });

  it.each(["swap", "order"] as const)("delegates %s allowance decisions to shouldApprove and skips an unnecessary transaction", async kind => {
    const spot = await client();
    const interactions = wallet();
    const session = execution(kind, spot, interactions);
    await session.run();
    const request = { tokenAddress: inputTokenAddress, spenderAddress: spender, amount: "10", approvalAmount: MAX_UINT_256 };
    expect(interactions.shouldApprove.mock.calls).toEqual([[request], [request]]);
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(session.approvalTxHash).toBeUndefined();
    expect(interactions.signOrder).toHaveBeenCalledOnce();
  });

  it("protects the reviewed approval request from mutation by shouldApprove", async () => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldApprove.mockImplementation(request => {
      expect(Reflect.set(request, "amount", "999")).toBe(false);
      expect(Reflect.set(request, "approvalAmount", "1")).toBe(false);
      expect(Reflect.set(request, "spenderAddress", account)).toBe(false);
      return true;
    });
    await execution("swap", spot, interactions).run();
    expect(interactions.approveToken).toHaveBeenCalledExactlyOnceWith({
      tokenAddress: inputTokenAddress, spenderAddress: spender, amount: "10", approvalAmount: MAX_UINT_256,
    });
  });

  it("wraps before approval and finalizes the quote immediately before signing", async () => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldWrap.mockReturnValue(true);
    interactions.wrapNativeToken.mockResolvedValue("0x11");
    interactions.shouldApprove.mockReturnValue(true);
    interactions.shouldWrap.mockReturnValue(true);
    interactions.wrapNativeToken.mockImplementation(async () => { vi.setSystemTime(initialTime + 90_000); return "0x11"; });
    const session = execution("swap", spot, interactions);
    await session.run();
    expect(interactions.wrapNativeToken.mock.invocationCallOrder[0]).toBeLessThan(interactions.approveToken.mock.invocationCallOrder[0]!);
    expect(interactions.approveToken.mock.invocationCallOrder[0]).toBeLessThan(interactions.signOrder.mock.invocationCallOrder[0]!);
    expect(fetchQuote).toHaveBeenCalledOnce();
    expect(session.preparedOrder?.order.deadline).toBe(String(initialTime / 1000 + 270));
    expect(session.preparedOrder?.order.witness.output.limit).toBe("18");
  });

  it.each([0, 20_000])("reuses a quote aged %s milliseconds without fetching or changing its reviewed minimum", async age => {
    const spot = await client();
    const interactions = wallet();
    const seed = { ...quote(), receivedAt: initialTime - age };
    const session = spot.createSwapExecution({ quote: seed, account, walletInteractions: interactions });
    vi.mocked(fetchQuote).mockResolvedValue({ ...quote(), minimumAmountOut: "17" });

    await session.run();

    expect(fetchQuote).not.toHaveBeenCalled();
    expect(session.preparedOrder?.quote).toEqual(seed);
    expect(session.preparedOrder?.values.minimumOutputAmountRaw).toBe("18");
    expect(session.preparedOrder?.order.witness.output.limit).toBe("18");
    expect(interactions.signOrder.mock.calls[0]![0].typedData.message.witness.output.limit).toBe("18");
    expect(interactions.signOrder).toHaveBeenCalledOnce();
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it.each([20_001, 21_000])("rejects a lower refreshed minimum for a seed quote aged %s milliseconds", async age => {
    const spot = await client();
    const interactions = wallet();
    const session = spot.createSwapExecution({ quote: { ...quote(), receivedAt: initialTime - age }, account, walletInteractions: interactions });
    vi.mocked(fetchQuote).mockResolvedValue({ ...quote(), minimumAmountOut: "17" });
    await expect(session.run()).rejects.toMatchObject({ code: "QUOTE_MINIMUM_DECREASED" });
    expect(fetchQuote).toHaveBeenCalledOnce();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("refreshes a quote just beyond the freshness limit and adopts its improved amounts", async () => {
    const spot = await client();
    const interactions = wallet();
    const seed = { ...quote(), receivedAt: initialTime - 20_001 };
    const session = spot.createSwapExecution({ quote: seed, account, walletInteractions: interactions });
    vi.mocked(fetchQuote).mockResolvedValue({ ...quote(), amountOut: "24", netAmountOut: "23", minimumAmountOut: "22" });
    await session.run();
    expect(fetchQuote).toHaveBeenCalledOnce();
    expect(session.preparedOrder?.quote.netAmountOut).toBe("23");
    expect(session.preparedOrder?.quote.minimumAmountOut).toBe("22");
    expect(session.preparedOrder?.values.minimumOutputAmountRaw).toBe("22");
    expect(session.preparedOrder?.order.witness.output.limit).toBe("22");
    expect(interactions.signOrder.mock.calls[0]![0].typedData.message.witness.output.limit).toBe("22");
    expect(seed.minimumAmountOut).toBe("18");
  });

  it.each([initialTime + 1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "refreshes a quote whose receipt timestamp cannot establish freshness (%s)",
    async receivedAt => {
      const spot = await client();
      const session = spot.createSwapExecution({ quote: { ...quote(), receivedAt }, account, walletInteractions: wallet() });
      await session.run();

      expect(fetchQuote).toHaveBeenCalledOnce();
      expect(session.preparedOrder?.quote.receivedAt).toBe(initialTime);
      expect(session.preparedOrder?.order.witness.output.limit).toBe("18");
    },
  );

  it("uses the immutable fresh quote captured by the constructor instead of later caller mutations", async () => {
    const spot = await client();
    const interactions = wallet();
    const seed = quote();
    const reviewed = structuredClone(seed);
    const session = spot.createSwapExecution({ quote: seed, account, walletInteractions: interactions });
    seed.minimumAmountOut = "1";
    seed.netAmountOut = "2";
    Object.assign(seed, { receivedAt: initialTime - 60_000 });
    Object.assign(seed.request, { inAmount: "999", outToken: account });

    await session.run();

    expect(fetchQuote).not.toHaveBeenCalled();
    expect(session.preparedOrder?.quote).toEqual(reviewed);
    expect(Object.isFrozen(session.preparedOrder?.quote)).toBe(true);
    expect(Object.isFrozen(session.preparedOrder?.quote.request)).toBe(true);
    expect(session.preparedOrder?.order.witness.output.limit).toBe("18");
    expect(session.preparedOrder?.order.permitted.amount).toBe("10");
    expect(session.preparedOrder?.order.witness.output.token).toBe(outputTokenAddress);
    expect(interactions.signOrder.mock.calls[0]![0].typedData.message).toEqual(session.preparedOrder?.order);
  });

  it("checks quote freshness after a pending approval has finished", async () => {
    const spot = await client();
    const interactions = wallet();
    const approving = deferred<void>();
    const approval = deferred<`0x${string}`>();
    interactions.shouldApprove.mockReturnValue(true);
    interactions.approveToken.mockImplementation(() => { approving.resolve(); return approval.promise; });
    const session = execution("swap", spot, interactions);
    const running = session.run();
    await approving.promise;
    expect(fetchQuote).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    vi.setSystemTime(initialTime + 20_001);
    interactions.shouldApprove.mockReturnValue(false);
    approval.resolve("0x22");
    await running;

    expect(fetchQuote).toHaveBeenCalledOnce();
    expect(session.preparedOrder?.quote.receivedAt).toBe(initialTime + 20_001);
    expect(session.preparedOrder?.values.currentTimeMillis).toBe(initialTime + 20_001);
    expect(interactions.signOrder).toHaveBeenCalledOnce();
  });

  it.each([0, 20_001])("stops a quote aged %s milliseconds when cancelled at the signing boundary", async age => {
    const spot = await client();
    const interactions = wallet();
    const controller = new AbortController();
    const reason = new Error("Wallet context changed before quote preparation");
    const session = spot.createSwapExecution({
      quote: { ...quote(), receivedAt: initialTime - age }, account,
      walletInteractions: interactions, signal: controller.signal,
    });

    await expect(session.run({ onProgress: update => {
      if (update.phase === "signing" && update.event === "request") controller.abort(reason);
    } })).rejects.toBe(reason);

    expect(fetchQuote).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
    expect(session.preparedOrder).toBeUndefined();
  });

  it("does not prepare or sign a refreshed quote returned after cancellation", async () => {
    const spot = await client();
    const interactions = wallet();
    const controller = new AbortController();
    const fetching = deferred<void>();
    const refreshed = deferred<SwapQuote>();
    vi.mocked(fetchQuote).mockImplementation(params => {
      expect(params.signal).toBeInstanceOf(AbortSignal);
      fetching.resolve();
      return refreshed.promise;
    });
    const session = spot.createSwapExecution({
      quote: { ...quote(), receivedAt: initialTime - 20_001 }, account,
      walletInteractions: interactions, signal: controller.signal,
    });
    const running = session.run();
    const reason = new Error("Wallet context changed while refreshing the quote");
    const cancelled = expect(running).rejects.toBe(reason);
    await fetching.promise;
    controller.abort(reason);
    // Cancellation takes precedence over a quote-minimum error from this late response.
    refreshed.resolve({ ...quote(), minimumAmountOut: "17" });
    await cancelled;

    expect(fetchQuote).toHaveBeenCalledOnce();
    expect(vi.mocked(fetchQuote).mock.calls[0]![0].signal?.aborted).toBe(true);
    expect(session.preparedOrder).toBeUndefined();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each([
    { field: "chain", changed: { chainId: 1 } },
    { field: "partner", changed: { partner: Partners.Thena } },
    { field: "input token", changed: { inToken: "0x5555555555555555555555555555555555555555" } },
    { field: "output token", changed: { outToken: "0x6666666666666666666666666666666666666666" } },
    { field: "input amount", changed: { inAmount: "11" } },
    { field: "slippage", changed: { slippage: 0.6 } },
    { field: "quote user", changed: { user: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } },
    { field: "DEX minimum", changed: { dexMinAmountOut: "19" } },
  ])("rejects a final quote with a different $field before signing", async ({ changed }) => {
    const spot = await client();
    const interactions = wallet();
    const session = execution("swap", spot, interactions);
    vi.setSystemTime(initialTime + 20_001);
    vi.mocked(fetchQuote).mockResolvedValue({ ...quote(), request: { ...quote().request, ...changed } });

    await expect(session.run()).rejects.toMatchObject({ code: "QUOTE_CONTEXT_MISMATCH" });
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
    expect(session.preparedOrder).toBeUndefined();
  });

  it("validates the finalized amounts before preparing or signing", async () => {
    const spot = await client();
    const interactions = wallet();
    vi.mocked(fetchQuote).mockResolvedValue({ ...quote(), minimumAmountOut: "21" });
    const session = execution("swap", spot, interactions);
    vi.setSystemTime(initialTime + 20_001);

    await expect(session.run()).rejects.toMatchObject({ code: "INVALID_QUOTE" });
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("keeps a preview quote user independent of the connected signer during finalization", async () => {
    const spot = await client();
    const interactions = wallet();
    const previewUser = "0x0000000000000000000000000000000000000001";
    const preview = { ...quote(), request: { ...quote().request, user: previewUser } };
    vi.mocked(fetchQuote).mockResolvedValue(preview);
    const session = spot.createSwapExecution({ quote: preview, account, walletInteractions: interactions });
    vi.setSystemTime(initialTime + 20_001);

    await session.run();
    expect(fetchQuote).toHaveBeenCalledWith(expect.objectContaining({ user: previewUser }), expect.anything());
    expect(session.preparedOrder?.quote.request.user).toBe(previewUser);
    expect(session.preparedOrder?.signingRequest.signerAddress).toBe(account);
    expect(session.preparedOrder?.order.witness.output.recipient).toBe(account);
  });

  it("waits for confirmed wallet prerequisites and final quote before publishing the immutable signing payload", async () => {
    const spot = await client();
    const interactions = wallet();
    const wrap = deferred<`0x${string}`>();
    const approval = deferred<`0x${string}`>();
    const finalQuote = deferred<SwapQuote>();
    const signingResult = deferred<`0x${string}`>();
    const wrapping = deferred<void>();
    const approving = deferred<void>();
    const finalizing = deferred<void>();
    const signing = deferred<void>();
    interactions.shouldWrap.mockReturnValue(true);
    interactions.shouldApprove.mockReturnValue(true);
    interactions.wrapNativeToken.mockImplementation(() => { wrapping.resolve(); return wrap.promise; });
    interactions.approveToken.mockImplementation(() => { approving.resolve(); return approval.promise; });
    vi.mocked(fetchQuote).mockImplementation(() => { finalizing.resolve(); return finalQuote.promise; });
    interactions.signOrder.mockImplementation(() => { signing.resolve(); return signingResult.promise; });
    const session = spot.createSwapExecution({ quote: quote(), account, walletInteractions: interactions });
    let prepared: PreparedSwap | undefined;
    const running = session.run({ onProgress: update => {
      if (update.event !== "prepared" || !update.preparedOrder || !("quote" in update.preparedOrder)) return;
      expect(interactions.signOrder).not.toHaveBeenCalled();
      prepared = structuredClone(update.preparedOrder);
      update.preparedOrder.quote.netAmountOut = "1";
      update.preparedOrder.order.witness.output.limit = "1";
    } });
    await wrapping.promise;
    expect(fetchQuote).not.toHaveBeenCalled();
    wrap.resolve("0x11");
    await approving.promise;
    expect(fetchQuote).not.toHaveBeenCalled();
    vi.setSystemTime(initialTime + 20_001);
    interactions.shouldApprove.mockReturnValue(false);
    approval.resolve("0x22");
    await finalizing.promise;
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(session.preparedOrder).toBeUndefined();
    const finalized = { ...quote(), request: { ...quote().request }, amountOut: "25", netAmountOut: "24", minimumAmountOut: "23" };
    finalQuote.resolve(finalized);
    await signing.promise;

    expect(prepared?.quote.netAmountOut).toBe("24");
    expect(prepared?.quote.minimumAmountOut).toBe("23");
    expect(prepared?.order.witness.output.limit).toBe("23");
    expect(session.preparedOrder).toEqual(prepared);
    expect(Object.isFrozen(session.preparedOrder?.quote.request)).toBe(true);
    const signed = interactions.signOrder.mock.calls[0]![0].typedData.message;
    expect(signed).toEqual(prepared?.order);
    expect(Object.isFrozen(signed.witness.output)).toBe(true);
    expect(submitOrder).not.toHaveBeenCalled();
    finalized.minimumAmountOut = "1";
    finalized.request.inAmount = "999";
    expect(session.preparedOrder?.quote.minimumAmountOut).toBe("23");
    expect(session.preparedOrder?.quote.request.inAmount).toBe("10");

    signingResult.resolve(signature);
    await running;
    await session.run();
    await session.submit();
    expect(fetchQuote).toHaveBeenCalledOnce();
    expect(interactions.signOrder).toHaveBeenCalledOnce();
    expect(submitOrder).toHaveBeenCalledOnce();
    expect(vi.mocked(submitOrder).mock.calls[0]![0]).toEqual(signed);
  });

  it.each(["swap", "order"] as const)("reports all entered %s phases through run only", async kind => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldWrap.mockReturnValue(true);
    interactions.wrapNativeToken.mockResolvedValue("0x11");
    interactions.shouldApprove.mockReturnValue(true);
    const session = execution(kind, spot, interactions);
    const updates: PublicUpdate[] = [];
    const result = await session.run({ onProgress: update => { updates.push(update); } });
    const requested = updates.filter(update => update.event === "request").map(update => update.phase);
    expect(requested.filter((phase, index) => phase !== requested[index - 1])).toEqual([
      "preparing", "wrapping", "preparing", "approving", "signing", "submitting", ...(kind === "swap" ? ["settling"] : []),
    ]);
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: "wrapping", event: "success", wrapTxHash: "0x11" }),
      expect.objectContaining({ phase: "approving", event: "transaction", approvalTxHash: "0x22" }),
      expect.objectContaining({ phase: "signing", event: "prepared", preparedOrder: expect.any(Object) }),
      expect.objectContaining({ phase: "signing", event: "success", signature }),
      expect.objectContaining({ event: "accepted", order: expect.objectContaining({ status: OrderStatus.Open }) }),
    ]));
    expect(updates[updates.length - 1]).toMatchObject({ phase: kind === "swap" ? "settling" : "submitting", event: "success", order: result });
    expect(result.status).toBe(kind === "swap" ? OrderStatus.Completed : OrderStatus.Open);
    expect(getOrder).toHaveBeenCalledTimes(kind === "swap" ? 1 : 0);
  });

  it.each(["swap", "order"] as const)("isolates %s signing and accepted state from observer mutations", async kind => {
    const spot = await client();
    const interactions = wallet();
    const session = execution(kind, spot, interactions);
    const result = await session.run({ onProgress: update => {
      if (update.preparedOrder && update.event === "prepared") {
        update.preparedOrder.order.permitted.amount = "999";
        update.preparedOrder.order.witness.output.limit = "1";
      }
      if (update.order && update.event === "accepted") {
        update.order.id = "0xobserver-only";
        update.order.status = OrderStatus.Completed;
        update.order.fills.push({ inAmount: "999", outAmount: "1", timestamp: initialTime, txHash: "0xobserver-only" });
      }
    } });
    const signed = interactions.signOrder.mock.calls[0]![0].typedData.message;
    expect(signed.permitted.amount).toBe("10");
    expect(signed.witness.output.limit).toBe(kind === "swap" ? "18" : "20");
    expect(vi.mocked(submitOrder).mock.calls[0]![0]).toEqual(signed);
    expect(result.id).not.toBe("0xobserver-only");
    expect(result.fills).toEqual([]);
    expect(session.order?.id).toBe(result.id);
    expect(Object.isFrozen(session.order)).toBe(true);
    expect(Object.isFrozen(session.preparedOrder?.order.witness)).toBe(true);
  });

  it.each([["swap", "throws"], ["swap", "rejects"], ["order", "throws"], ["order", "rejects"]] as const)("completes %s when its run observer %s", async (kind, failure) => {
    const spot = await client();
    const onProgress = vi.fn((_update: PublicUpdate) => {
      if (failure === "throws") throw new Error("Observer failed");
      return Promise.reject(new Error("Observer failed"));
    });
    await expect(execution(kind, spot).run({ onProgress })).resolves.toMatchObject({ status: kind === "swap" ? OrderStatus.Completed : OrderStatus.Open });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ event: "success" }));
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it.each([
    ["swap", "preparing"], ["order", "preparing"], ["swap", "wrapping"], ["order", "wrapping"],
    ["swap", "approving"], ["order", "approving"], ["swap", "signing"], ["order", "signing"],
    ["swap", "submitting"], ["order", "submitting"], ["swap", "settling"],
  ] as const)("reports exactly one %s error when %s fails", async (kind, phase) => {
    const spot = await client();
    const interactions = wallet();
    const failure = new Error(`${phase} failed`);
    if (phase === "wrapping") { interactions.shouldWrap.mockReturnValue(true); interactions.wrapNativeToken.mockRejectedValueOnce(failure); }
    if (phase === "approving") { interactions.shouldApprove.mockReturnValue(true); interactions.approveToken.mockRejectedValueOnce(failure); }
    if (phase === "signing") interactions.signOrder.mockRejectedValueOnce(failure);
    if (phase === "submitting") vi.mocked(submitOrder).mockRejectedValueOnce(failure);
    if (phase === "settling") vi.mocked(getOrder).mockImplementationOnce(async ({ orderId }) => ({ ...acceptedOrders.get(orderId)!, status: OrderStatus.Expired }));
    const updates: PublicUpdate[] = [];
    const session = execution(kind, spot, interactions);
    const pending = session.run({ onProgress: update => { updates.push(update); if (phase === "preparing" && update.phase === "preparing" && update.event === "request") session.cancel(failure); } });
    if (phase === "settling") await expect(pending).rejects.toMatchObject({ name: "OrderSettlementError", reason: "expired" });
    else await expect(pending).rejects.toBe(failure);
    const errors = updates.filter(update => update.event === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.phase).toBe(phase);
    expect(updates[updates.length - 1]).toBe(errors[0]);
    if (phase === "settling") expect(session.order?.status).toBe(OrderStatus.Expired);
    else expect(getOrder).not.toHaveBeenCalled();
  });

  it("runs advanced orders to acceptance and tracks them only when explicitly requested", async () => {
    const spot = await client();
    const session = spot.createOrderExecution({ form: form(OrderType.TWAP), account, inputTokenAddress, outputTokenAddress, walletInteractions: wallet() });
    await expect(session.run()).resolves.toMatchObject({ type: OrderVariant.TWAP_MARKET, status: OrderStatus.Open });
    expect(session.preparedOrder?.values.totalTrades).toBe(2);
    expect(getOrder).not.toHaveBeenCalled();
    await expect(session.waitForCompletion()).resolves.toMatchObject({ status: OrderStatus.Completed });
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it("keeps an advanced session at acceptance when its signed lifetime resembles a swap", async () => {
    const spot = await client();
    const reviewed = form();
    reviewed.values.duration = { unit: TimeUnit.Minutes, value: 2 };
    const session = spot.createOrderExecution({ form: reviewed, account, inputTokenAddress, outputTokenAddress, walletInteractions: wallet() });
    await session.run();
    expect(session.order?.type).toBe(OrderVariant.SWAP);
    await expect(session.run()).resolves.toMatchObject({ status: OrderStatus.Open });
    expect(getOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["swap", "cancel"], ["swap", "signal"], ["order", "cancel"],
  ] as const)("retains a late %s acceptance after %s during the real submission request", async (kind, cancellation) => {
    const spot = await client();
    const http = await interceptSubmission();
    const interactions = wallet();
    const controller = new AbortController();
    const session = kind === "swap"
      ? spot.createSwapExecution({ quote: quote(), account, walletInteractions: interactions, signal: controller.signal })
      : spot.createOrderExecution({ form: form(), inputTokenAddress, outputTokenAddress, account, walletInteractions: interactions, signal: controller.signal });
    const updates: PublicUpdate[] = [];
    const running = session.run({ onProgress: update => { updates.push(update); } });
    let finished = false;
    void running.then(() => { finished = true; }, () => { finished = true; });
    const posted = await http.started.promise;
    const submitting = session.submit();
    expect(session.submit()).toBe(submitting);
    const reason = new Error("Execution cancelled while POST is pending");
    if (cancellation === "signal") controller.abort(reason);
    else session.cancel(reason);
    await Promise.resolve();
    expect(posted.signal.aborted).toBe(false);
    expect(finished).toBe(false);
    expect(session.order).toBeUndefined();
    const accepted = acceptedOrder(posted.order);
    http.response.resolve(new Response(JSON.stringify({ success: true, signedOrder: accepted.rawOrder }), { status: 200 }));
    await expect(submitting).resolves.toMatchObject({ id: accepted.id, status: OrderStatus.Open });
    if (kind === "order") await expect(running).resolves.toMatchObject({ id: accepted.id, status: OrderStatus.Open });
    else await expect(running).rejects.toBe(reason);
    expect(session.order).toMatchObject({ id: accepted.id, status: OrderStatus.Open });
    expect(Object.isFrozen(session.order)).toBe(true);
    expect(updates).toContainEqual(expect.objectContaining({ event: "accepted", order: expect.objectContaining({ id: accepted.id }) }));
    expect(getOrder).not.toHaveBeenCalled();
    expect(session.submit()).toBe(submitting);
    await expect(session.submit()).resolves.toMatchObject({ id: accepted.id });
    expect(session.run()).toBe(running);
    expect(http.fetchRequest).toHaveBeenCalledOnce();
    expect(submitOrder).toHaveBeenCalledOnce();
    expect(interactions.signOrder).toHaveBeenCalledOnce();
  });

  it.each(["swap", "order"] as const)("does not POST a %s cancelled by the submitting request observer", async kind => {
    const spot = await client();
    const http = await interceptSubmission();
    const session = execution(kind, spot);
    const reason = new Error("Cancelled before POST");
    await expect(session.run({ onProgress: update => {
      if (update.phase === "submitting" && update.event === "request") session.cancel(reason);
    } })).rejects.toBe(reason);
    expect(http.fetchRequest).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
    expect(session.order).toBeUndefined();
  });

  it("keeps late acceptance isolated from another independently submitted session", async () => {
    const spot = await client();
    const http = await interceptSubmission();
    const first = execution("swap", spot);
    const running = first.run();
    const posted = await http.started.promise;
    const submitting = first.submit();
    const reason = new Error("First execution cancelled after POST");
    first.cancel(reason);
    http.fetchRequest.mockImplementation(async (_request, options) => {
      const body = JSON.parse(String(options?.body)) as { order: RePermitOrder };
      const accepted = acceptedOrder(body.order);
      return new Response(JSON.stringify({ success: true, signedOrder: accepted.rawOrder }), { status: 200 });
    });
    const second = execution("order", spot);
    const secondOrder = await second.run();
    const firstOrder = acceptedOrder(posted.order);
    expect(firstOrder.id).not.toBe(secondOrder.id);
    http.response.resolve(new Response(JSON.stringify({ success: true, signedOrder: firstOrder.rawOrder }), { status: 200 }));
    await expect(submitting).resolves.toMatchObject({ id: firstOrder.id });
    await expect(running).rejects.toBe(reason);
    expect(first.order?.id).toBe(firstOrder.id);
    expect(second.order?.id).toBe(secondOrder.id);
    expect(first.submit()).toBe(submitting);
    await expect(second.submit()).resolves.toMatchObject({ id: secondOrder.id });
    expect(http.fetchRequest).toHaveBeenCalledTimes(2);
    expect(submitOrder).toHaveBeenCalledTimes(2);
    expect(getOrder).not.toHaveBeenCalled();
  });

  it("keeps a cancelled submission bounded by the real HTTP timeout without repeating POST", async () => {
    const spot = await client();
    const http = await interceptSubmission();
    const session = execution("swap", spot);
    const running = session.run();
    const posted = await http.started.promise;
    const submitting = session.submit();
    const rejectedRun = expect(running).rejects.toMatchObject({ code: "SUBMISSION_FAILED", message: expect.stringContaining("timed out") });
    const rejectedSubmit = expect(submitting).rejects.toMatchObject({ code: "SUBMISSION_FAILED" });
    session.cancel(new Error("Stopped execution after POST"));
    expect(posted.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.all([rejectedRun, rejectedSubmit]);
    expect(posted.signal.aborted).toBe(true);
    expect(session.submit()).toBe(submitting);
    expect(session.run()).toBe(running);
    expect(session.order).toBeUndefined();
    expect(http.fetchRequest).toHaveBeenCalledOnce();
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it("never repeats POST after unknown acceptance and keeps signing inputs available", async () => {
    const spot = await client();
    const session = execution("swap", spot);
    const failure = new Error("Network failed after POST");
    vi.mocked(submitOrder).mockRejectedValue(failure);
    await expect(session.run()).rejects.toBe(failure);
    await expect(session.submit()).rejects.toBe(failure);
    await expect(session.run()).rejects.toBe(failure);
    expect(submitOrder).toHaveBeenCalledOnce();
    expect(session.preparedOrder).toBeDefined();
    expect(session.signature).toBe(signature);
    expect(session.order).toBeUndefined();
  });

  it("tracks the accepted order on the same session through the configured endpoint", async () => {
    const spot = await client("https://custom-orders.example/v2");
    const session = spot.createSwapExecution({ quote: quote(), account, walletInteractions: wallet() });
    await session.wrap();
    await session.approve();
    await session.sign();
    const accepted = await session.submit();
    expect(session.order?.id).toBe(accepted.id);
    await expect(session.waitForCompletion()).resolves.toMatchObject({ id: accepted.id, status: OrderStatus.Completed });
    expect(getOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: accepted.id, chainId: 137, apiUrl: spot.apiUrl }));
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it("keeps same-session tracking bounded by the signed deadline without another POST", async () => {
    const spot = await client();
    const session = execution("swap", spot);
    await session.wrap();
    await session.approve();
    await session.sign();
    const accepted = await session.submit();
    vi.setSystemTime(accepted.deadline + 61_000);
    await expect(session.waitForCompletion()).rejects.toMatchObject({
      name: "OrderSettlementError", reason: "unconfirmed", orderId: accepted.id,
    });
    expect(session.order?.id).toBe(accepted.id);
    expect(session.order?.deadline).toBe(accepted.deadline);
    expect(getOrder).not.toHaveBeenCalled();
    expect(submitOrder).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["swap", "order"] as const)("rejects saved-order input passed to the %s factory", async kind => {
    const spot = await client();
    const session = execution(kind, spot);
    await session.wrap();
    await session.approve();
    await session.sign();
    const accepted = await session.submit();
    session.cancel();
    vi.mocked(submitOrder).mockClear();
    // JavaScript callers cannot use a saved order in place of the required quote/form.
    const invalid = { order: accepted };
    const create = kind === "swap"
      ? () => spot.createSwapExecution(invalid as unknown as Parameters<SpotClient["createSwapExecution"]>[0])
      : () => spot.createOrderExecution(invalid as unknown as Parameters<SpotClient["createOrderExecution"]>[0]);
    expect(create).toThrow();
    expect(getOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("rejects a forged calculated swap form at constructor validation", async () => {
    const spot = await client();
    const interactions = wallet();
    expect(() => spot.createOrderExecution({ form: { ...form(), orderType: "SWAP" as OrderType }, account, inputTokenAddress, outputTokenAddress, walletInteractions: interactions })).toThrow(/createSwapExecution/);
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each(["swap", "order"] as const)("stops a pre-cancelled %s before wallet work", async kind => {
    const spot = await client();
    const interactions = wallet();
    const session = execution(kind, spot, interactions);
    const reason = new Error("Wallet context changed");
    session.cancel(reason);
    await expect(session.run()).rejects.toBe(reason);
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("keeps client telemetry opt-out isolated from an unrelated caller-supplied reporter", async () => {
    const unrelated = createAnalytics({}, { disableAnalytics: true });
    const options = { disableAnalytics: true, analytics: unrelated };
    const spot = await createClient(Partners.Quick, 137, options);
    unrelated.setDisabled(false);
    const params = { form: form(), account, inputTokenAddress, outputTokenAddress, walletInteractions: wallet(), disableAnalytics: false };
    const session = spot.createOrderExecution(params);
    await session.run();
    expect(getClientAnalytics(spot).isDisabled).toBe(true);
    expect(getOrderAnalytics(session.preparedOrder!.order as RePermitOrder)?.isDisabled).toBe(true);
    expect(getSubmittedOrderAnalytics(session.order as Order)?.isDisabled).toBe(true);
  });

  it.each([
    ["swap", true], ["swap", false], ["order", true], ["order", false],
  ] as const)("keeps the client analytics policy for %s despite an extra execution flag (disabled=%s)", async (kind, disabled) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    const spot = await createClient(Partners.Quick, 137, { disableAnalytics: disabled });
    const extra = { account, walletInteractions: wallet(), disableAnalytics: !disabled };
    const session = kind === "swap"
      ? spot.createSwapExecution({ ...extra, quote: quote() })
      : spot.createOrderExecution({ ...extra, form: form(), inputTokenAddress, outputTokenAddress });
    await session.run();
    expect(getOrderAnalytics(session.preparedOrder!.order as RePermitOrder)?.isDisabled).toBe(disabled);
    expect(getSubmittedOrderAnalytics(session.order as Order)?.isDisabled).toBe(disabled);
    expect(getClientAnalytics(spot).isDisabled).toBe(disabled);
    getClientAnalytics(spot).setDisabled(true);
  });

  it("keeps enabled and disabled clients independent while their sessions execute", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    const enabled = await createClient(Partners.Quick, 137);
    const disabled = await createClient(Partners.Quick, 137, { disableAnalytics: true });
    const enabledExecution = execution("order", enabled);
    const disabledExecution = execution("order", disabled);
    await Promise.all([enabledExecution.run(), disabledExecution.run()]);
    expect(getSubmittedOrderAnalytics(enabledExecution.order as Order)?.isDisabled).toBe(false);
    expect(getSubmittedOrderAnalytics(disabledExecution.order as Order)?.isDisabled).toBe(true);
    expect(getClientAnalytics(enabled).isDisabled).toBe(false);
    expect(getClientAnalytics(disabled).isDisabled).toBe(true);
    getClientAnalytics(enabled).setDisabled(true);
  });

  it("rejects a per-quote opt-out before an enabled client's quote transport can send analytics", async () => {
    const requests = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", requests);
    const spot = await createClient(Partners.Quick, 137);
    requests.mockClear();
    const actual = await vi.importActual<typeof import("../src/lib/quote")>("../src/lib/quote");
    vi.mocked(fetchQuote).mockImplementation(actual.fetchQuote);
    const params = {
      inToken: inputTokenAddress, outToken: outputTokenAddress, inAmount: "10", user: account,
      slippage: 0.5, disableAnalytics: true,
    };
    await expect(spot.getQuote(params)).rejects.toMatchObject({ kind: "invalid-request", message: expect.stringContaining("createClient") });
    expect(requests).not.toHaveBeenCalled();
    getClientAnalytics(spot).setDisabled(true);
  });

  it.each([true, false])("uses the client quote policy (disabled=%s)", async disabled => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    const spot = await createClient(Partners.Quick, 137, { disableAnalytics: disabled });
    const params = {
      inToken: inputTokenAddress, outToken: outputTokenAddress, inAmount: "10", user: account,
      slippage: 0.5,
    };
    await spot.getQuote(params);
    const reporter = vi.mocked(fetchQuote).mock.calls[0]![1];
    expect(reporter.isDisabled).toBe(disabled);
    expect(getClientAnalytics(spot).isDisabled).toBe(disabled);
    getClientAnalytics(spot).setDisabled(true);
  });
});

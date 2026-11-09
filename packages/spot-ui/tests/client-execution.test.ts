import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/lib/client";
import { createAnalytics, executeClientOrder, getClientAnalytics, resumeClientOrder } from "../src/internal";
import type { OrderWalletInteractions } from "../src/lib/execute-order";
import { fetchRePermitData } from "../src/lib/fetch-repermit-data";
import { calculateOrder } from "../src/lib/order-form/calculate-order-form";
import { buildV2Order, getOrder } from "../src/lib/orders/v2-orders";
import { fetchQuote, type SwapQuote } from "../src/lib/quote";
import { submitOrder } from "../src/lib/submit-order";
import { OrderSettlementError } from "../src/lib/order-settlement-error";
import { Module, OrderStatus, OrderType, Partners, TimeUnit, type Order, type RePermitData, type RePermitOrder } from "../src/lib/types";

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

const form = (module = Module.SWAP) => calculateOrder({
  module,
  inputTokenDecimals: 0, outputTokenDecimals: 0,
  quotedOutputAmountRaw: "20", minimumOutputAmountRaw: "18",
  inputBalanceRaw: "100", inputTokenUsdPrice: "1", outputTokenUsdPrice: "1",
  minTradeSizeUsd: 1, priceProtectionPercent: 5,
  userInput: { inputAmountUi: "10", isMarketOrder: module !== Module.SWAP, tradeCount: 2 },
});

const wallet = () => ({
  shouldWrap: vi.fn<OrderWalletInteractions["shouldWrap"]>().mockReturnValue(false),
  wrapNativeToken: vi.fn<OrderWalletInteractions["wrapNativeToken"]>().mockResolvedValue("0x11"),
  approveToken: vi.fn<OrderWalletInteractions["approveToken"]>().mockResolvedValue("0x22"),
  getAllowance: vi.fn<OrderWalletInteractions["getAllowance"]>().mockResolvedValue("10"),
  signOrder: vi.fn<OrderWalletInteractions["signOrder"]>().mockResolvedValue(signature),
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
};

const client = (apiUrl?: string) => createClient(Partners.Quick, 137, { disableAnalytics: true, apiUrl });

describe("client execution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(initialTime);
    vi.resetAllMocks();
    acceptedOrders.clear();
    vi.mocked(fetchRePermitData).mockResolvedValue(configuration());
    vi.mocked(fetchQuote).mockImplementation(async () => quote());
    vi.mocked(submitOrder).mockImplementation(async (order) => acceptedOrder(order));
    vi.mocked(getOrder).mockImplementation(async ({ orderId }) => {
      const accepted = acceptedOrders.get(orderId);
      return accepted && completedOrder(accepted);
    });
  });

  afterEach(() => { vi.useRealTimers(); });

  it("shares the account lock across public and internal methods and releases it after success or failure", async () => {
    const spot = await client();
    const interactions = wallet();
    const allowance = deferred<string>();
    interactions.getAllowance.mockReturnValueOnce(allowance.promise);
    const first = executeClientOrder(spot, {
      form: form(), quote: quote(), account, inputTokenAddress, outputTokenAddress,
      walletInteractions: interactions,
    });
    const orderParams = {
      form: form(), inputTokenAddress, outputTokenAddress,
      account: account.toUpperCase(), walletInteractions: interactions,
    };
    await expect(spot.executeOrder(orderParams)).rejects.toMatchObject({ code: "EXECUTION_IN_PROGRESS" });
    allowance.resolve("10");
    await first;

    const rejection = new Error("Wallet rejected signing");
    interactions.signOrder.mockRejectedValueOnce(rejection);
    await expect(spot.executeOrder(orderParams)).rejects.toBe(rejection);
    await expect(spot.executeSwap({ quote: quote(), account, walletInteractions: interactions }))
      .resolves.toMatchObject({ status: "completed", order: { status: OrderStatus.Completed } });
    expect(submitOrder).toHaveBeenCalledTimes(2);
  });

  it("skips wrapping when the host shouldWrap decision is false", async () => {
    const spot = await client();
    const interactions = wallet();
    interactions.getAllowance.mockResolvedValueOnce("0");
    const result = await spot.executeSwap({ quote: quote(), account, walletInteractions: interactions });

    expect(result.order.status).toBe(OrderStatus.Completed);
    expect(interactions.shouldWrap).toHaveBeenCalledExactlyOnceWith();
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).toHaveBeenCalledWith({
      tokenAddress: inputTokenAddress, amount: "10", spenderAddress: spender,
    });
    expect(interactions.signOrder).toHaveBeenCalledOnce();
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it("wraps the reviewed amount before approval and prepares fresh signing data after confirmation", async () => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldWrap.mockReturnValue(true);
    interactions.getAllowance.mockResolvedValueOnce("0");
    interactions.wrapNativeToken.mockImplementation(async () => {
      vi.setSystemTime(initialTime + 90_000);
      return "0x11";
    });
    const result = await spot.executeSwap({ quote: quote(), account, walletInteractions: interactions });

    expect(interactions.shouldWrap).toHaveBeenCalledExactlyOnceWith();
    expect(interactions.wrapNativeToken).toHaveBeenCalledExactlyOnceWith("10");
    expect(interactions.wrapNativeToken.mock.invocationCallOrder[0]).toBeLessThan(interactions.approveToken.mock.invocationCallOrder[0]!);
    expect(interactions.approveToken.mock.invocationCallOrder[0]).toBeLessThan(interactions.signOrder.mock.invocationCallOrder[0]!);
    expect(Number(interactions.signOrder.mock.calls[0]![0].typedData.message.deadline) * 1000).toBe(initialTime + 270_000);
    expect(result.wrapTxHash).toBe("0x11");
  });

  it.each([true, false])("awaits an asynchronous shouldWrap=%s before allowance reads or wallet writes", async (decision) => {
    const spot = await client();
    const interactions = wallet();
    const pending = deferred<boolean>();
    interactions.shouldWrap.mockReturnValue(pending.promise);
    const execution = spot.executeSwap({ quote: quote(), account, walletInteractions: interactions });

    expect(interactions.shouldWrap).toHaveBeenCalledExactlyOnceWith();
    expect(interactions.getAllowance).not.toHaveBeenCalled();
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
    pending.resolve(decision);
    await execution;
    expect(interactions.wrapNativeToken).toHaveBeenCalledTimes(decision ? 1 : 0);
  });

  it("stops before wallet work when shouldWrap rejects, and releases the execution lock", async () => {
    const spot = await client();
    const interactions = wallet();
    const failure = new Error("Cannot determine the current input token");
    interactions.shouldWrap.mockRejectedValueOnce(failure);
    await expect(spot.executeSwap({ quote: quote(), account, walletInteractions: interactions })).rejects.toBe(failure);
    expect(interactions.getAllowance).not.toHaveBeenCalled();
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
    await expect(spot.executeSwap({ quote: quote(), account, walletInteractions: interactions })).resolves.toMatchObject({ status: "completed" });
  });

  it("stops after an abort while shouldWrap is pending, before any wallet work", async () => {
    const spot = await client();
    const interactions = wallet();
    const pending = deferred<boolean>();
    const controller = new AbortController();
    const reason = new Error("The reviewed wallet context changed");
    interactions.shouldWrap.mockReturnValue(pending.promise);
    const execution = spot.executeSwap({
      quote: quote(), account, walletInteractions: interactions, signal: controller.signal,
    });
    controller.abort(reason);
    pending.resolve(true);
    await expect(execution).rejects.toBe(reason);
    expect(interactions.getAllowance).not.toHaveBeenCalled();
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each([undefined, "true", 1, null])("rejects a non-boolean shouldWrap result (%s) before wallet work", async (decision) => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldWrap.mockReturnValue(decision as unknown as boolean);
    await expect(spot.executeSwap({ quote: quote(), account, walletInteractions: interactions })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(interactions.getAllowance).not.toHaveBeenCalled();
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("rejects a missing shouldWrap callback before wallet work", async () => {
    const spot = await client();
    const interactions = wallet();
    (interactions as Partial<OrderWalletInteractions>).shouldWrap = undefined;
    await expect(spot.executeSwap({ quote: quote(), account, walletInteractions: interactions })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(interactions.getAllowance).not.toHaveBeenCalled();
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each(["10", "4"])("verifies a completed wrap's live balance (%s) and wraps only a shortfall", async (balance) => {
    const spot = await client();
    const interactions = {
      ...wallet(),
      getTokenBalance: vi.fn().mockResolvedValueOnce(balance).mockResolvedValue("10"),
    };
    interactions.shouldWrap.mockReturnValue(true);
    const progress: Array<{ phase: string; wrapAmountRaw?: string }> = [];
    const result = await executeClientOrder(spot, {
      form: form(), quote: quote(), account, inputTokenAddress, outputTokenAddress,
      walletInteractions: interactions, completedWrapTxHash: "0xprevious",
      onUpdate: (update) => { progress.push(update); },
    });

    expect(interactions.getTokenBalance).toHaveBeenCalledTimes(2);
    expect(interactions.getTokenBalance).toHaveBeenCalledWith({ tokenAddress: inputTokenAddress });
    if (balance === "10") {
      expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
      expect(result.wrapTxHash).toBe("0xprevious");
    } else {
      expect(interactions.wrapNativeToken).toHaveBeenCalledExactlyOnceWith("6");
      expect(progress).toContainEqual(expect.objectContaining({ phase: "wrapping", wrapAmountRaw: "6" }));
      expect(result.wrapTxHash).toBe("0x11");
    }
  });

  it("requires a balance reader before reusing a completed wrap", async () => {
    const spot = await client();
    const interactions = wallet();
    interactions.shouldWrap.mockReturnValue(true);
    await expect(executeClientOrder(spot, {
      form: form(), quote: quote(), account, inputTokenAddress, outputTokenAddress,
      walletInteractions: interactions, completedWrapTxHash: "0xprevious",
    })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(interactions.getAllowance).not.toHaveBeenCalled();
    expect(interactions.wrapNativeToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
  });

  it.each(["executeOrder", "executeSwap", "internal-order", "prepareOrder", "prepareSwap", "submitSignedOrder", "submitSignedSwap"] as const)(
    "%s rejects a native input placeholder before wallet work or submission",
    async (method) => {
      const spot = await client();
      const interactions = wallet();
      const nativeInputToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
      const nativeQuote = { ...quote(), request: { ...quote().request, inToken: nativeInputToken } };
      const prepared = await spot.prepareSwap({ quote: quote(), account });
      prepared.order.permitted.token = nativeInputToken;
      prepared.order.witness.input.token = nativeInputToken;
      const orderParams = {
        form: form(), account, inputTokenAddress: nativeInputToken, outputTokenAddress,
        walletInteractions: interactions,
      };
      await expect(Promise.resolve().then(async (): Promise<unknown> => {
        switch (method) {
          case "executeOrder": return spot.executeOrder(orderParams);
          case "executeSwap": return spot.executeSwap({ quote: nativeQuote, account, walletInteractions: interactions });
          case "internal-order": return executeClientOrder(spot, { ...orderParams, quote: nativeQuote });
          case "prepareOrder": return spot.prepareOrder({ ...orderParams, swapperAddress: account });
          case "prepareSwap": return spot.prepareSwap({ quote: nativeQuote, account });
          case "submitSignedOrder": return spot.submitSignedOrder(prepared.order, signature);
          case "submitSignedSwap": return spot.submitSignedSwap(prepared, signature);
        }
      })).rejects.toThrow(/wrapped|ERC.?20|native|input/i);
      expect(interactions.getAllowance).not.toHaveBeenCalled();
      expect(interactions.approveToken).not.toHaveBeenCalled();
      expect(interactions.signOrder).not.toHaveBeenCalled();
      expect(submitOrder).not.toHaveBeenCalled();
      expect(getOrder).not.toHaveBeenCalled();
    },
  );

  it.each(["submitSignedOrder", "submitSignedSwap"] as const)(
    "%s rejects a native token in either signed input field before POST",
    async (method) => {
      const spot = await client();
      for (const field of ["permitted", "witness"] as const) {
        const prepared = await spot.prepareSwap({ quote: quote(), account });
        if (field === "permitted") prepared.order.permitted.token = "0x0000000000000000000000000000000000000000";
        else prepared.order.witness.input.token = "0x0000000000000000000000000000000000001010";
        const submission = method === "submitSignedOrder"
          ? spot.submitSignedOrder(prepared.order, signature)
          : spot.submitSignedSwap(prepared, signature);
        await expect(submission).rejects.toThrow(/wrapped|ERC.?20|native|input/i);
      }
      expect(submitOrder).not.toHaveBeenCalled();
      expect(getOrder).not.toHaveBeenCalled();
    },
  );

  it.each(["executeOrder", "executeSwap", "internal-order"] as const)(
    "%s rejects legacy nativeInput wrapping intent before any wallet interaction",
    async (method) => {
      const spot = await client();
      const interactions = wallet();
      const params = {
        form: form(), quote: quote(), account, inputTokenAddress, outputTokenAddress,
        walletInteractions: interactions, nativeInput: true,
      };
      const execution = method === "executeOrder"
        ? spot.executeOrder(params)
        : method === "executeSwap"
          ? spot.executeSwap(params)
          : executeClientOrder(spot, params);
      await expect(execution).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
      expect(interactions.getAllowance).not.toHaveBeenCalled();
      expect(interactions.approveToken).not.toHaveBeenCalled();
      expect(interactions.signOrder).not.toHaveBeenCalled();
      expect(submitOrder).not.toHaveBeenCalled();
    },
  );

  it("signs the reviewed form snapshot when the caller mutates it during wallet work", async () => {
    const spot = await client();
    const interactions = wallet();
    const allowance = deferred<string>();
    interactions.getAllowance.mockReturnValueOnce(allowance.promise);
    const reviewed = form();
    const execution = spot.executeOrder({
      form: reviewed, inputTokenAddress, outputTokenAddress,
      account, walletInteractions: interactions,
    });
    reviewed.inputAmount.raw = "99";
    reviewed.values.inputAmount = "99";
    reviewed.values.minOutputAmountPerTrade = "1";
    reviewed.values.duration.value = 999;
    allowance.resolve("10");
    const result = await execution;

    const signed = interactions.signOrder.mock.calls[0]![0].typedData.message;
    expect(signed.permitted.amount).toBe("10");
    expect(signed.witness.output.limit).toBe("18");
    expect(result.preparedOrder.form.inputAmount.raw).toBe("10");
    expect(result.preparedOrder.form.values.minOutputAmountPerTrade).toBe("18");
    expect(result.preparedOrder.form.values.duration.value).not.toBe(999);
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("prepares fresh signing timestamps after confirmed approval", async () => {
    const spot = await client();
    const interactions = wallet();
    interactions.getAllowance.mockResolvedValueOnce("0");
    interactions.approveToken.mockImplementation(async () => {
      vi.setSystemTime(initialTime + 90_000);
      return "0x22";
    });
    const result = await spot.executeOrder({
      form: form(), inputTokenAddress, outputTokenAddress,
      account, walletInteractions: interactions,
    });

    const signed = interactions.signOrder.mock.calls[0]![0].typedData.message;
    expect(interactions.approveToken).toHaveBeenCalledOnce();
    expect(signed.witness.start).toBe(String((initialTime + 90_000) / 1000));
    expect(result.preparedOrder.values.currentTimeMillis).toBe(initialTime + 90_000);
    expect(signed.witness.output.limit).toBe("18");
    expect(fetchQuote).not.toHaveBeenCalled();
    expect(submitOrder).toHaveBeenCalledWith(signed, signature, expect.anything(), expect.anything(), expect.anything());
  });

  it("ignores removed lifecycle fields supplied through a structurally wider public input", async () => {
    const spot = await client();
    const interactions = wallet();
    interactions.getAllowance.mockResolvedValueOnce("0").mockResolvedValueOnce("0");
    const validateContext = vi.fn(() => { throw new Error("Removed context callback ran"); });
    const onUpdate = vi.fn();
    const wait = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
    const analytics = getClientAnalytics(spot).createOperation();
    const onExecutionRequest = vi.spyOn(analytics, "onExecutionRequest");
    const params = {
      form: form(), account, inputTokenAddress, outputTokenAddress,
      walletInteractions: interactions,
      quote: { ...quote(), netAmountOut: "21", minimumAmountOut: "17" },
      completedWrapTxHash: "0xalready-wrapped",
      validateContext, onUpdate, analytics, wait,
    };
    const execution = spot.executeOrder(params);
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await execution;

    expect(result.order.status).toBe(OrderStatus.Completed);
    expect(result.preparedOrder.order.witness.output.limit).toBe("18");
    expect(interactions.getAllowance).toHaveBeenCalledTimes(3);
    expect(validateContext).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onExecutionRequest).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("keeps public client analytics isolated from a removed reporter option", async () => {
    const analytics = createAnalytics({}, { disableAnalytics: true });
    const options = { disableAnalytics: true, analytics };
    const spot = await createClient(Partners.Quick, 137, options);

    analytics.setDisabled(false);
    expect(getClientAnalytics(spot).isDisabled).toBe(true);
    expect("analytics" in spot).toBe(false);
  });

  it("ignores removed preparation and resume lifecycle controls from wider public inputs", async () => {
    const spot = await client();
    const analytics = getClientAnalytics(spot).createOperation();
    const onQuoteSuccess = vi.spyOn(analytics, "onQuoteSuccess");
    const onSettlementUpdate = vi.spyOn(analytics, "onSettlementUpdate");
    const prepareParams = { quote: quote(), account, analytics };
    const prepared = await spot.prepareSwap(prepareParams);
    const accepted = acceptedOrder(prepared.order);
    const onUpdate = vi.fn();
    const resumeParams = { order: accepted, analytics, onUpdate };

    await expect(spot.executeOrder(resumeParams)).resolves.toMatchObject({
      id: accepted.id, status: OrderStatus.Completed,
    });
    expect(onQuoteSuccess).not.toHaveBeenCalled();
    expect(onSettlementUpdate).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("prepares and executes a calculated TWAP without a swap quote", async () => {
    const spot = await client();
    const interactions = wallet();
    const reviewed = form(Module.TWAP);
    const result = await spot.executeOrder({
      form: reviewed, inputTokenAddress, outputTokenAddress,
      account, walletInteractions: interactions,
    });

    const signed = interactions.signOrder.mock.calls[0]![0].typedData.message;
    expect(result.preparedOrder.form.module).toBe(Module.TWAP);
    expect(result.preparedOrder.values.totalTrades).toBe(2);
    expect(signed.permitted.amount).toBe("10");
    expect(signed.witness.input.amount).toBe("5");
    expect(signed.witness.output.token).toBe(outputTokenAddress);
    expect(fetchQuote).not.toHaveBeenCalled();
    expect(submitOrder).toHaveBeenCalledOnce();
    expect(result.order.status).toBe(OrderStatus.Open);
    expect(getOrder).not.toHaveBeenCalled();
  });

  it.each(["executeSwap", "executeOrder", "submitSignedSwap", "submitSignedOrder"] as const)(
    "%s resolves after the swap fills, with one submission and one polling loop",
    async (method) => {
      const spot = await client();
      const interactions = wallet();
      const prepared = await spot.prepareSwap({ quote: quote(), account });
      const pollingStarted = deferred<void>();
      const settlement = deferred<Order>();
      vi.mocked(getOrder).mockImplementationOnce(() => {
        pollingStarted.resolve();
        return settlement.promise;
      });
      const onOrderUpdate = vi.fn();
      const options = { signal: undefined, onOrderUpdate };
      const execution = method === "executeSwap"
        ? spot.executeSwap({ quote: quote(), account, walletInteractions: interactions })
        : method === "executeOrder"
          ? spot.executeOrder({
            form: form(), account, inputTokenAddress, outputTokenAddress,
            walletInteractions: interactions,
          })
          : method === "submitSignedSwap"
            ? spot.submitSignedSwap(prepared, signature, options)
            : spot.submitSignedOrder(prepared.order, signature, options);
      let resolved = false;
      void execution.then(() => { resolved = true; });
      await pollingStarted.promise;

      expect(resolved).toBe(false);
      expect(submitOrder).toHaveBeenCalledOnce();
      expect(getOrder).toHaveBeenCalledOnce();
      const accepted = [...acceptedOrders.values()][0]!;
      const completed = completedOrder(accepted);
      settlement.resolve(completed);
      const result = await execution;
      expect("order" in result ? result.order : result).toBe(completed);
      if (method === "executeSwap") expect(result).toMatchObject({ type: "intent", status: "completed" });
      expect(onOrderUpdate).not.toHaveBeenCalled();
      expect(submitOrder).toHaveBeenCalledOnce();
      expect(getOrder).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("keeps the account lock until swap settlement completes", async () => {
    const spot = await client();
    const interactions = wallet();
    const pollingStarted = deferred<void>();
    const settlement = deferred<Order>();
    vi.mocked(getOrder).mockImplementationOnce(() => {
      pollingStarted.resolve();
      return settlement.promise;
    });
    const first = spot.executeSwap({ quote: quote(), account, walletInteractions: interactions });
    await pollingStarted.promise;
    await expect(spot.executeOrder({
      form: form(), inputTokenAddress, outputTokenAddress,
      account, walletInteractions: interactions,
    })).rejects.toMatchObject({ code: "EXECUTION_IN_PROGRESS" });
    expect(submitOrder).toHaveBeenCalledOnce();
    settlement.resolve(completedOrder([...acceptedOrders.values()][0]!));
    await first;
    await expect(spot.executeSwap({ quote: quote(), account, walletInteractions: interactions }))
      .resolves.toMatchObject({ status: "completed" });
  });

  it("reports acceptance before settlement updates for calculated swaps", async () => {
    const spot = await client();
    const updates: string[] = [];
    await executeClientOrder(spot, {
      form: form(), quote: quote(), inputTokenAddress, outputTokenAddress,
      account, walletInteractions: wallet(),
      onUpdate: (update) => {
        if ((update.event === "accepted" || update.event === "updated") && update.order) {
          updates.push(`${update.phase}:${update.event}:${update.order.status}`);
        }
      },
    });
    expect(updates).toEqual([
      `settling:accepted:${OrderStatus.Open}`,
      `settling:updated:${OrderStatus.Completed}`,
    ]);
  });

  it("preserves internal context, progress, analytics, and allowance delays", async () => {
    const spot = await client();
    const interactions = wallet();
    interactions.getAllowance.mockResolvedValueOnce("0").mockResolvedValueOnce("0");
    const validateContext = vi.fn();
    const onUpdate = vi.fn();
    const wait = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
    const analytics = getClientAnalytics(spot).createOperation();
    const onExecutionRequest = vi.spyOn(analytics, "onExecutionRequest");
    const result = await executeClientOrder(spot, {
      form: form(), quote: quote(), account, inputTokenAddress, outputTokenAddress,
      walletInteractions: interactions,
      validateContext, onUpdate, analytics, wait,
    });

    expect(result.order.status).toBe(OrderStatus.Completed);
    expect(validateContext).toHaveBeenCalled();
    expect(wait).toHaveBeenCalledWith(3_000);
    expect(onExecutionRequest).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ event: "accepted" }));
  });

  it("returns signed advanced orders at acceptance without starting settlement polling", async () => {
    const spot = await client();
    const prepared = spot.prepareOrder({
      form: form(Module.TWAP), inputTokenAddress, outputTokenAddress, swapperAddress: account,
    });
    const onOrderUpdate = vi.fn();
    const options = { signal: undefined, onOrderUpdate };
    const result = await spot.submitSignedOrder(prepared.order, signature, options);
    expect(result).toMatchObject({ type: OrderType.TWAP_MARKET, status: OrderStatus.Open });
    expect(onOrderUpdate).not.toHaveBeenCalled();
    expect(getOrder).not.toHaveBeenCalled();
    expect(submitOrder).toHaveBeenCalledOnce();
  });

  it("keeps known LIMIT submissions at acceptance when their protocol lifetime resembles a swap", async () => {
    const spot = await client();
    const reviewed = form(Module.LIMIT);
    // Protocol payloads have no module marker, including externally adjusted forms.
    reviewed.values.duration = { unit: TimeUnit.Minutes, value: 2 };
    const prepared = spot.prepareOrder({
      form: reviewed, inputTokenAddress, outputTokenAddress, swapperAddress: account,
    });
    const accepted = acceptedOrder(prepared.order);
    expect(accepted.type).toBe(OrderType.SWAP);
    vi.mocked(submitOrder).mockResolvedValueOnce(accepted);

    await expect(spot.submitSignedOrder(prepared.order, signature))
      .resolves.toMatchObject({ id: accepted.id, status: OrderStatus.Open });
    expect(getOrder).not.toHaveBeenCalled();
  });

  it("retains acceptance when tracking is aborted without submitting again", async () => {
    const spot = await client();
    const pollingStarted = deferred<void>();
    const lookup = deferred<Order>();
    vi.mocked(getOrder).mockImplementationOnce(() => {
      pollingStarted.resolve();
      return lookup.promise;
    });
    const controller = new AbortController();
    const execution = spot.executeSwap({
      quote: quote(), account, walletInteractions: wallet(), signal: controller.signal,
    });
    await pollingStarted.promise;
    const accepted = [...acceptedOrders.values()][0]!;
    const failure = execution.catch((error: unknown) => error);
    controller.abort();
    expect(await failure).toMatchObject({
      name: "OrderSettlementError", reason: "aborted", orderId: accepted.id, order: accepted,
    });
    expect(submitOrder).toHaveBeenCalledOnce();
    expect(getOrder).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains acceptance after the settlement deadline without retrying the submission", async () => {
    const spot = await client();
    vi.mocked(getOrder).mockResolvedValue(undefined);
    const execution = spot.executeSwap({ quote: quote(), account, walletInteractions: wallet() });
    const failure = execution.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(240_000);
    const error = await failure;
    const accepted = [...acceptedOrders.values()][0]!;
    expect(error).toBeInstanceOf(OrderSettlementError);
    expect(error).toMatchObject({ reason: "unconfirmed", orderId: accepted.id, order: accepted });
    expect(submitOrder).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resumes an accepted swap with read-only lookups on the original client endpoint", async () => {
    const spot = await client("https://orders.example.test");
    const prepared = await spot.prepareSwap({ quote: quote(), account });
    const accepted = acceptedOrder(prepared.order);
    const onUpdate = vi.fn();
    const result = await resumeClientOrder(spot, { order: accepted }, { onUpdate });
    expect(result).toMatchObject({ id: accepted.id, status: OrderStatus.Completed });
    expect(getOrder).toHaveBeenCalledWith(expect.objectContaining({
      orderId: accepted.id, chainId: 137, apiUrl: spot.apiUrl,
    }));
    expect(onUpdate).toHaveBeenCalledWith(result);
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("recovers a completed swap from a saved snapshot after its original tracking deadline", async () => {
    const spot = await client();
    const prepared = await spot.prepareSwap({ quote: quote(), account });
    const accepted = acceptedOrder(prepared.order);
    vi.setSystemTime(accepted.deadline + 60_001);

    await expect(spot.executeOrder({ order: accepted })).resolves.toMatchObject({
      id: accepted.id, status: OrderStatus.Completed, deadline: accepted.deadline,
    });
    expect(getOrder).toHaveBeenCalledOnce();
    expect(submitOrder).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds recovery of an expired saved snapshot without changing or resubmitting its order", async () => {
    const spot = await client();
    const prepared = await spot.prepareSwap({ quote: quote(), account });
    const accepted = acceptedOrder(prepared.order);
    vi.setSystemTime(accepted.deadline + 60_001);
    vi.mocked(getOrder).mockResolvedValue(undefined);
    const recovery = spot.executeOrder({ order: accepted }).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(await recovery).toMatchObject({
      reason: "unconfirmed", orderId: accepted.id,
      order: { id: accepted.id, deadline: accepted.deadline },
    });
    expect(getOrder).toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects recovery on a different client chain before looking up the order", async () => {
    const spot = await client();
    const prepared = await spot.prepareSwap({ quote: quote(), account });
    const accepted = acceptedOrder(prepared.order);
    await expect(spot.executeOrder({ order: { ...accepted, chainId: 56 } })).rejects.toThrow(/chain/i);
    expect(getOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("rejects missing or mismatched SWAP quotes before wallet work", async () => {
    const spot = await client();
    const interactions = wallet();
    for (const [reviewedQuote, code] of [
      [undefined, "INVALID_QUOTE"],
      [{ ...quote(), netAmountOut: "21" }, "QUOTE_CONTEXT_MISMATCH"],
    ] as const) {
      await expect(executeClientOrder(spot, {
        form: form(), quote: reviewedQuote, inputTokenAddress, outputTokenAddress,
        account, walletInteractions: interactions,
      })).rejects.toMatchObject({ code });
    }
    expect(interactions.getAllowance).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each(["swap", "internal-order"] as const)("rejects a lower refreshed minimum in %s before signing or submission", async (method) => {
    const spot = await client();
    const interactions = wallet();
    const reviewed = { ...quote(), receivedAt: initialTime - 21_000 };
    vi.mocked(fetchQuote).mockResolvedValue({ ...quote(), minimumAmountOut: "17" });
    const execution = method === "swap"
      ? spot.executeSwap({ quote: reviewed, account, walletInteractions: interactions })
      : executeClientOrder(spot, {
        form: form(), quote: reviewed, account, inputTokenAddress, outputTokenAddress,
        walletInteractions: interactions,
      });
    await expect(execution).rejects.toMatchObject({ code: "QUOTE_MINIMUM_DECREASED" });
    expect(fetchQuote).toHaveBeenCalledOnce();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each(["order", "swap"] as const)("does no wallet work for a pre-aborted %s", async (kind) => {
    const spot = await client();
    const interactions = wallet();
    const controller = new AbortController();
    const reason = new Error("Account changed");
    controller.abort(reason);
    const shared = { account, walletInteractions: interactions, signal: controller.signal };
    const execution = kind === "swap"
      ? spot.executeSwap({ ...shared, quote: quote() })
      : spot.executeOrder({ ...shared, form: form(), inputTokenAddress, outputTokenAddress });
    await expect(execution).rejects.toBe(reason);
    expect(interactions.getAllowance).not.toHaveBeenCalled();
    expect(interactions.approveToken).not.toHaveBeenCalled();
    expect(interactions.signOrder).not.toHaveBeenCalled();
    expect(submitOrder).not.toHaveBeenCalled();
  });
});

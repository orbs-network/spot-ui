import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateOrder,
  createClient,
  OrderType,
  SpotError,
  OrderStatus,
  OrderVariant,
  Partners,
  type CreateOrderExecutionParams,
  type Order,
  type PreparedOrder,
  type OrderExecutionUpdate,
  type SpotClient,
  type RePermitOrder,
} from "@orbs-network/spot-ui";
import { createOrderExecutionSession } from "../../spot-ui/src/lib/internal/execute-order";
import { createAnalytics as createEngineAnalytics } from "../../spot-ui/src/lib/analytics";
import {
  createAnalytics,
  type SpotAnalytics,
} from "@orbs-network/spot-ui/internal";
import { orderExecution, suggestedApprovalAmount, testWallet, type OrderRunParams } from "./execution-fixtures";
import { createSpotStore } from "../src/context/create-spot-store";
import { executeOrder, type ExecuteOrderParams } from "../src/execute-order";
import { checkOrderStatus } from "../src/check-order-status";
import { ExecutionPhase, type Callbacks, type Token, type WalletInteractions } from "../src/types";
import { updateTrackedOrderInCache } from "../src/order-cache";
import { getSubmitButtonState } from "../src/submit-button-state";
import { createOperationAnalytics } from "../src/analytics";

const executionRunners = vi.hoisted(() => new WeakMap<SpotClient, (params: OrderRunParams) => Promise<Order>>());
const clientReporters = vi.hoisted(() => new WeakMap<SpotClient, SpotAnalytics>());

vi.mock("@orbs-network/spot-ui/internal", async (importOriginal) => ({
  ...await importOriginal<typeof import("@orbs-network/spot-ui/internal")>(),
  getClientAnalytics: vi.fn((client: SpotClient) => {
    const reporter = clientReporters.get(client);
    if (!reporter) throw new Error("No internal analytics reporter configured for this client");
    return reporter;
  }),
}));

vi.mock("@orbs-network/spot-ui", async importOriginal => ({
  ...await importOriginal<typeof import("@orbs-network/spot-ui")>(),
  createClient: vi.fn(),
}));

const account = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const inputAddress = "0x1111111111111111111111111111111111111111";
const outputAddress = "0x2222222222222222222222222222222222222222";
const adapter = "0x4444444444444444444444444444444444444444";
const inputToken = { address: inputAddress, decimals: 0, symbol: "IN" } as Token;
const outputToken = { address: outputAddress, decimals: 0, symbol: "OUT" } as Token;
const analytics = createAnalytics({}, { disableAnalytics: true });
const apiUrl = "https://order-sink-dev.orbs.network";
const prepared = {} as PreparedOrder;

const form = (orderType = OrderType.TWAP) => calculateOrder({
  orderType, inputTokenDecimals: 0, outputTokenDecimals: 0,
  quotedOutputAmountRaw: "20",
  inputBalanceRaw: "100", inputTokenUsdPrice: "1", outputTokenUsdPrice: "1",
  minTradeSizeUsd: 1, priceProtectionPercent: 5,
  userInput: { inputAmountUi: "10", isMarketOrder: true, tradeCount: 2 },
});

const order = (variant = OrderVariant.TWAP_MARKET): Order => ({
  id: "accepted-order", historyKey: "2:137:accepted-order", chainId: 137,
  maker: account, type: variant, status: OrderStatus.Open, progress: 0,
  deadline: Date.now() + 180_000, version: 2,
  rawOrder: { order: { witness: { exchange: { adapter } } } },
} as unknown as Order);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};

const progress = (
  phase: OrderExecutionUpdate<PreparedOrder>["phase"],
  event: OrderExecutionUpdate<PreparedOrder>["event"],
  snapshot?: Order,
): OrderExecutionUpdate<PreparedOrder> => ({
  phase, event, order: snapshot, steps: ["create"], stepIndex: 0, hasApproval: true,
});

const setup = (run: (params: OrderRunParams) => Promise<Order>, callbacks: Callbacks = {}) => {
  const store = createSpotStore({});
  const client = {
    partner: Partners.Quick, chainId: 137, apiUrl, spenderAddress: adapter,
    createOrderExecution: vi.fn((params: CreateOrderExecutionParams) => orderExecution(params, input => executionRunners.get(client)!(input), client.spenderAddress)),
    createSwapExecution: vi.fn(), getOrder: vi.fn(), getOrders: vi.fn(),
  } as unknown as SpotClient;
  executionRunners.set(client, run);
  clientReporters.set(client, analytics);
  store.getState().configureOrders(JSON.stringify([account, adapter, Partners.Quick, 137, true]), undefined, callbacks);
  const execute = (
    orderType = OrderType.TWAP,
    overrides: Partial<Pick<ExecuteOrderParams, "inputToken" | "wrappedNativeToken" | "walletInteractions" | "signal" | "form">> = {},
  ) => executeOrder({
    account, chainId: 137, inputToken, outputToken, form: form(orderType), client,
    walletInteractions: testWallet(), callbacks,
    addNewOrder: store.getState().addOrder, refetchActiveOrders: vi.fn(),
    onOrderUpdate: (current) => updateTrackedOrderInCache(store, current, callbacks, client.partner),
    subscribeExecution: (listener) => store.subscribe(listener),
    getCurrentExecution: () => store.getState().state.currentExecution,
    getExecution: store.getState().getExecution,
    finishExecution: store.getState().finishExecution,
    beginExecution: store.getState().beginExecution, replaceExecution: store.getState().replaceExecution,
    ...overrides,
  });
  return { store, client, execute };
};

const realSession = (client: SpotClient, params: CreateOrderExecutionParams, submit: () => Promise<Order>) =>
  createOrderExecutionSession({
    account: params.account, inputTokenAddress: params.inputTokenAddress, inputAmountRaw: params.form.inputAmount.raw,
    walletInteractions: params.walletInteractions, signal: params.signal,
    prepareOrder: (): PreparedOrder => {
      const start = Math.floor(Date.now() / 1000).toString();
      const deadline = (Number(start) + 180).toString();
      const payload: RePermitOrder = {
        permitted: { token: inputAddress, amount: "10" }, spender: adapter, nonce: start, deadline,
        witness: {
          reactor: adapter, executor: adapter, exchange: { adapter, ref: adapter, share: 0, data: "0x" },
          swapper: account, nonce: start, deadline, start, chainid: 137, exclusivity: 0, epoch: 0, slippage: 500, freshness: 60,
          input: { token: inputAddress, amount: "10", maxAmount: "10" },
          output: { token: outputAddress, limit: "20", recipient: account },
        },
      };
      return {
        order: payload, form: params.form, values: { ...params.form.values, currentTimeMillis: Date.now(), deadlineMillis: Number(deadline) * 1000 },
        approvalRequest: { tokenAddress: inputAddress, spenderAddress: adapter, amount: "10", approvalAmount: suggestedApprovalAmount },
        signingRequest: { signerAddress: account, typedData: { domain: { name: "RePermit", version: "1", chainId: 137, verifyingContract: adapter },
          primaryType: "Order", types: {}, message: payload } },
      };
    },
  }, { client, submitOrder: submit, waitForCompletionOnRun: false, analytics: createEngineAnalytics({}, { disableAnalytics: true }) });

describe("React internal settlement lifecycle", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("shares the private client's telemetry policy without exposing an analytics property", () => {
    const { client } = setup(vi.fn());
    const reporter = createAnalytics({}, { disableAnalytics: false });
    clientReporters.set(client, reporter);

    const operation = createOperationAnalytics({ account }, client);

    expect(client).not.toHaveProperty("analytics");
    expect(operation.isDisabled).toBe(false);
    reporter.setDisabled(true);
    expect(operation.isDisabled).toBe(true);
  });

  it("keeps unowned fallback reporting silent until a client exists", () => {
    expect(createOperationAnalytics({ account }).isDisabled).toBe(true);
  });

  it("keeps real SDK allowance preparation on review before wrapping and approving", async () => {
    const callbacks = {
      onWrapRequest: vi.fn(), onWrapSuccess: vi.fn(), onApproveRequest: vi.fn(), onApproveSuccess: vi.fn(),
      onOrderCreated: vi.fn(), onSubmitOrderFailed: vi.fn(),
    };
    const { store, client, execute } = setup(vi.fn(), callbacks);
    const accepted = order();
    vi.mocked(client.createOrderExecution).mockImplementation(params => realSession(client, params, async () => accepted));
    const allowance = deferred<boolean>();
    const wrapReceipt = deferred<`0x${string}`>();
    const approvalReceipt = deferred<`0x${string}`>();
    const wallet = testWallet();
    vi.mocked(wallet.shouldWrap).mockReturnValue(true);
    vi.mocked(wallet.shouldApprove).mockReturnValueOnce(allowance.promise).mockReturnValue(false);
    vi.mocked(wallet.wrapNativeToken).mockReturnValue(wrapReceipt.promise);
    vi.mocked(wallet.approveToken).mockReturnValue(approvalReceipt.promise);
    const pending = execute(OrderType.TWAP, {
      inputToken: { ...inputToken, address: "0x0000000000000000000000000000000000000000" },
      wrappedNativeToken: inputToken, walletInteractions: wallet,
    });

    await vi.waitFor(() => expect(wallet.shouldApprove).toHaveBeenCalledOnce());
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.PREPARING, totalSteps: undefined, pendingSteps: undefined, wrapTxHash: undefined,
    });
    expect(wallet.wrapNativeToken).not.toHaveBeenCalled();
    expect(wallet.approveToken).not.toHaveBeenCalled();
    expect(wallet.signOrder).not.toHaveBeenCalled();
    expect(callbacks.onWrapRequest).not.toHaveBeenCalled();

    allowance.resolve(true);
    await vi.waitFor(() => expect(wallet.wrapNativeToken).toHaveBeenCalledOnce());
    expect(store.getState().state.currentExecution).toMatchObject({ phase: ExecutionPhase.WRAPPING, totalSteps: 3 });
    expect(callbacks.onWrapRequest).toHaveBeenCalledOnce();
    expect(callbacks.onWrapSuccess).not.toHaveBeenCalled();
    expect(wallet.approveToken).not.toHaveBeenCalled();

    wrapReceipt.resolve("0xwrap");
    await vi.waitFor(() => expect(wallet.approveToken).toHaveBeenCalledOnce());
    expect(wallet.shouldApprove).toHaveBeenCalledOnce();
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.APPROVING, wrapTxHash: "0xwrap", totalSteps: 3,
    });
    expect(callbacks.onWrapSuccess).toHaveBeenCalledOnce();
    expect(callbacks.onApproveRequest).toHaveBeenCalledOnce();
    expect(wallet.signOrder).not.toHaveBeenCalled();

    approvalReceipt.resolve("0xapprove");
    await expect(pending).resolves.toEqual(accepted);
    expect(wallet.shouldApprove).toHaveBeenCalledTimes(2);
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.SUCCESS, wrapTxHash: "0xwrap", approveTxHash: "0xapprove",
    });
    expect(callbacks.onApproveSuccess).toHaveBeenCalledOnce();
    expect(callbacks.onOrderCreated).toHaveBeenCalledOnce();
    expect(callbacks.onSubmitOrderFailed).not.toHaveBeenCalled();
  });

  it("keeps a real ambiguous POST failure unconfirmed without reporting a definite submission failure", async () => {
    const failure = new SpotError("SUBMISSION_FAILED", "Response lost", { cause: new Error("Network disconnected") });
    const callbacks = { onSubmitOrderFailed: vi.fn(), onOrderCreated: vi.fn() };
    const { store, client, execute } = setup(vi.fn(), callbacks);
    vi.mocked(client.createOrderExecution).mockImplementation(params => realSession(client, params, async () => { throw failure; }));
    await expect(execute()).rejects.toBe(failure);
    expect(store.getState().state.currentExecution).toMatchObject({ phase: ExecutionPhase.UNCONFIRMED, preparedOrder: { order: expect.any(Object) } });
    expect(callbacks.onSubmitOrderFailed).not.toHaveBeenCalled();
    expect(callbacks.onOrderCreated).not.toHaveBeenCalled();
    const executionId = store.getState().state.currentExecution.executionId;
    expect(store.getState().startNewOrder({}, executionId)).toBe(true);
    expect(store.getState().getExecution(executionId!)?.phase).toBe(ExecutionPhase.UNCONFIRMED);
  });

  it.each([
    "0x0000000000000000000000000000000000000000",
    "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "0x0000000000000000000000000000000000001010",
  ])("normalizes native input %s and retains wrapping progress in the reviewed flow", async (address) => {
    const accepted = order();
    const callbacks = { onWrapRequest: vi.fn(), onWrapSuccess: vi.fn(), onOrderCreated: vi.fn() };
    const run = vi.fn(async (params: OrderRunParams) => {
      params.onProgress?.({ ...progress("wrapping", "request"), steps: ["wrap", "create"], hasApproval: false, wrapAmountRaw: "10" });
      params.onProgress?.({ ...progress("wrapping", "success"), steps: ["wrap", "create"], stepIndex: 1, wrapTxHash: "0xwrap", wrapAmountRaw: "10" });
      params.onProgress?.({ ...progress("signing", "request"), wrapTxHash: "0xwrap" });
      params.onProgress?.({ ...progress("submitting", "request"), wrapTxHash: "0xwrap" });
      params.onProgress?.({ ...progress("submitting", "accepted", accepted), wrapTxHash: "0xwrap" });
      return accepted;
    });
    const { store, client, execute } = setup(run, callbacks);
    const walletInteractions = {
      shouldWrap: vi.fn(() => true), shouldApprove: vi.fn(() => false),
      wrapNativeToken: vi.fn(),
      approveToken: vi.fn(), signOrder: vi.fn(), cancelOrder: vi.fn(),
    } as WalletInteractions;
    const nativeToken = { ...inputToken, address };

    await expect(execute(OrderType.TWAP, { inputToken: nativeToken, wrappedNativeToken: inputToken, walletInteractions }))
      .resolves.toBe(accepted);

    expect(client.createOrderExecution).toHaveBeenCalledWith(expect.objectContaining({
      inputTokenAddress: inputAddress, walletInteractions: expect.objectContaining({ wrapNativeToken: expect.any(Function) }),
    }));
    expect(run).toHaveBeenCalledOnce();
    expect(store.getState().state.currentExecution.sdkExecution).toBe(vi.mocked(client.createOrderExecution).mock.results[0]?.value);
    expect(store.getState().state.currentExecution.sdkExecution?.order).toEqual(accepted);
    expect(vi.mocked(client.createOrderExecution).mock.calls[0]?.[0]).not.toHaveProperty("onProgress");
    expect(vi.mocked(client.createOrderExecution).mock.calls[0]?.[0]).not.toHaveProperty("disableAnalytics");
    expect(store.getState().state.currentExecution.sdkExecution?.run).toHaveBeenCalledWith({ onProgress: expect.any(Function) });
    expect(client.createSwapExecution).not.toHaveBeenCalled();
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.SUCCESS, wrapTxHash: "0xwrap",
      inputToken: nativeToken,
      completedWrap: { account, chainId: 137, inputTokenAddress: address, inputAmountRaw: "10", txHash: "0xwrap" },
    });
    expect(callbacks.onWrapRequest).toHaveBeenCalledOnce();
    expect(callbacks.onWrapSuccess).toHaveBeenCalledExactlyOnceWith({ txHash: "0xwrap", amount: "10" });
  });

  it("allows native input review when the wrapped-token metadata is available", () => {
    const inputs = {
      orderType: OrderType.TWAP, inputToken: { ...inputToken, address: "0x0000000000000000000000000000000000000000" },
      outputToken, inputBalanceRaw: "100", noLiquidity: false, inputAmountUi: "10",
      marketPriceLoading: false, hasChainId: true, form: form(), hasClient: true,
      isClientLoading: false, executionPhase: ExecutionPhase.IDLE,
    };
    expect(getSubmitButtonState({ ...inputs, wrappedNativeToken: inputToken }))
      .toEqual({ disabled: false, loading: false });
    expect(getSubmitButtonState({ ...inputs, wrappedNativeToken: undefined }))
      .toEqual({ disabled: true, loading: false, disabledReason: "missing-wrapped-native-token" });
  });

  it("retains a confirmed wrap receipt when its wallet scope is aborted before the SDK receives it", async () => {
    const abort = new AbortController();
    const reason = new Error("Wallet changed");
    const wallet = testWallet();
    vi.mocked(wallet.wrapNativeToken).mockImplementation(async () => {
      abort.abort(reason);
      return "0xconfirmed";
    });
    const callbacks = { onWrapSuccess: vi.fn() };
    const { store, execute } = setup(async params => {
      params.onProgress?.(progress("wrapping", "request"));
      try { await params.walletInteractions.wrapNativeToken("10"); }
      catch (error) {
        params.onProgress?.({ ...progress("wrapping", "error"), error });
        throw error;
      }
      throw new Error("Expected the stale scope guard to reject");
    }, callbacks);
    const nativeToken = { ...inputToken, address: "0x0000000000000000000000000000000000000000" };
    await expect(execute(OrderType.TWAP, {
      inputToken: nativeToken, wrappedNativeToken: inputToken, walletInteractions: wallet, signal: abort.signal,
    })).rejects.toBe(reason);
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.FAILED, wrapTxHash: "0xconfirmed",
      completedWrap: { txHash: "0xconfirmed", account, chainId: 137, inputTokenAddress: nativeToken.address },
    });
    expect(callbacks.onWrapSuccess).toHaveBeenCalledExactlyOnceWith({ txHash: "0xconfirmed", amount: "10" });
  });

  it("clears a dismissed wrap marker without passing a receipt override to the SDK", async () => {
    const nativeToken = { ...inputToken, address: "0x0000000000000000000000000000000000000000" };
    const accepted = order();
    const run = vi.fn(async (params: OrderRunParams) => {
      params.onProgress?.(progress("signing", "request"));
      params.onProgress?.(progress("submitting", "request"));
      params.onProgress?.(progress("submitting", "accepted", accepted));
      return accepted;
    });
    const { store, execute } = setup(run);
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.FAILED,
      completedWrap: { account, chainId: 137, inputTokenAddress: nativeToken.address, wrappedTokenAddress: inputAddress, inputAmountRaw: "10", txHash: "0xconfirmed" },
    } });
    expect(store.getState().returnToOrderForm(1)).toBe(true);
    expect(store.getState().state.currentExecution.completedWrap).toBeUndefined();
    await execute(OrderType.TWAP, { inputToken: nativeToken, wrappedNativeToken: inputToken });
    const factory = vi.mocked(store.getState().state.currentExecution.client!.createOrderExecution).mock.calls[0]?.[0];
    expect(factory).not.toHaveProperty("completedWrapTxHash");
    expect(factory).not.toHaveProperty("validateContext");
    expect(run).toHaveBeenCalledOnce();
  });

  it("allows a larger native order after the previous review returns to the form", async () => {
    const nativeToken = { ...inputToken, address: "0x0000000000000000000000000000000000000000" };
    const wallet = testWallet();
    const accepted = order();
    vi.mocked(wallet.shouldWrap).mockReturnValue(true);
    const { store, execute } = setup(async params => {
      if (await params.walletInteractions.shouldWrap()) await params.walletInteractions.wrapNativeToken("20");
      params.onProgress?.(progress("signing", "request"));
      params.onProgress?.(progress("submitting", "request"));
      params.onProgress?.(progress("submitting", "accepted", accepted));
      return accepted;
    });
    const completedWrap = {
      account, chainId: 137, inputTokenAddress: nativeToken.address, wrappedTokenAddress: inputAddress,
      inputAmountRaw: "10", txHash: "0xconfirmed",
    };
    store.getState().updateState({ currentExecution: { executionId: 1, phase: ExecutionPhase.FAILED, completedWrap } });
    expect(store.getState().returnToOrderForm(1)).toBe(true);
    expect(store.getState().syncFormDefaults({ tradeCount: 3 })).toBe(true);
    const largerForm = calculateOrder({
      orderType: OrderType.TWAP, inputTokenDecimals: 0, outputTokenDecimals: 0, quotedOutputAmountRaw: "40",
      inputBalanceRaw: "100", inputTokenUsdPrice: "1", minTradeSizeUsd: 1, priceProtectionPercent: 5,
      userInput: { inputAmountUi: "20", isMarketOrder: true, tradeCount: 2 },
    });
    await expect(execute(OrderType.TWAP, {
      inputToken: nativeToken, wrappedNativeToken: inputToken, walletInteractions: wallet, form: largerForm,
    })).resolves.toBe(accepted);
    expect(wallet.wrapNativeToken).toHaveBeenCalledExactlyOnceWith("20");
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.SUCCESS, wrapTxHash: "0xwrap", completedWrap: { inputAmountRaw: "20", txHash: "0xwrap" },
    });
  });

  it.each([
    { invalidInput: "form", message: "Order form is not submittable" },
    { invalidInput: "wrapped-token metadata", message: "missing wrappedNativeToken for native input" },
  ])("does not restore a dismissed wrap marker after invalid $invalidInput", async ({ invalidInput, message }) => {
    const nativeToken = { ...inputToken, address: "0x0000000000000000000000000000000000000000" };
    const wallet = testWallet();
    const accepted = order();
    vi.mocked(wallet.shouldWrap).mockReturnValue(true);
    const run = vi.fn(async (params: OrderRunParams) => {
      if (await params.walletInteractions.shouldWrap()) await params.walletInteractions.wrapNativeToken("10");
      params.onProgress?.(progress("signing", "request"));
      params.onProgress?.(progress("submitting", "request"));
      params.onProgress?.(progress("submitting", "accepted", accepted));
      return accepted;
    });
    const { store, execute } = setup(run);
    const completedWrap = {
      account, chainId: 137, inputTokenAddress: nativeToken.address, wrappedTokenAddress: inputAddress,
      inputAmountRaw: "10", txHash: "0xconfirmed",
    };
    store.getState().updateState({ currentExecution: { executionId: 1, phase: ExecutionPhase.FAILED, completedWrap } });
    expect(store.getState().returnToOrderForm(1)).toBe(true);

    await expect(execute(OrderType.TWAP, {
      inputToken: nativeToken,
      wrappedNativeToken: invalidInput === "wrapped-token metadata" ? undefined : inputToken,
      walletInteractions: wallet,
      form: invalidInput === "form" ? { ...form(), canSubmit: false } : form(),
    })).rejects.toThrow(message);
    expect(run).not.toHaveBeenCalled();
    const failedExecution = store.getState().state.currentExecution;
    expect(failedExecution).toMatchObject({ phase: ExecutionPhase.FAILED });
    expect(failedExecution.completedWrap).toBeUndefined();
    expect(store.getState().returnToOrderForm(failedExecution.executionId)).toBe(true);

    await expect(execute(OrderType.TWAP, {
      inputToken: nativeToken, wrappedNativeToken: inputToken, walletInteractions: wallet,
    })).resolves.toBe(accepted);
    expect(wallet.wrapNativeToken).toHaveBeenCalledExactlyOnceWith("10");
    expect(store.getState().state.currentExecution.completedWrap?.txHash).toBe("0xwrap");
  });

  it("retains advanced acceptance before the runner resolves and creates only one order callback", async () => {
    const accepted = order();
    const completed = accepted;
    const settlement = deferred<Order>();
    const callbacks = { onOrderCreated: vi.fn(), onOrderFilled: vi.fn() };
    const run = vi.fn(async (params: OrderRunParams) => {
      params.onProgress?.(progress("signing", "request"));
      params.onProgress?.(progress("submitting", "request"));
      params.onProgress?.(progress("submitting", "accepted", accepted));
      const result = await settlement.promise;
      params.onProgress?.(progress("submitting", "success", result));
      return result;
    });
    const { store, client, execute } = setup(run, callbacks);
    const execution = execute();
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.SUBMITTING, orderId: accepted.id, order: accepted, client,
    });
    expect(callbacks.onOrderCreated).toHaveBeenCalledExactlyOnceWith(accepted);
    settlement.resolve(completed);
    await expect(execution).resolves.toBe(completed);
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SUCCESS);
    expect(store.getState().orders.data).toEqual([completed]);
    expect(callbacks.onOrderCreated).toHaveBeenCalledOnce();
    expect(callbacks.onOrderFilled).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledOnce();
    expect(client.createSwapExecution).not.toHaveBeenCalled();
  });

  it.each(["wrapping", "approving", "signing", "submitting"] as const)(
    "continues a detached %s attempt without replacing the new order's progress",
    async phase => {
      const firstResult = deferred<Order>();
      const secondResult = deferred<Order>();
      const firstOrder = { ...order(), id: "first-order", historyKey: "2:137:first-order" };
      const secondOrder = { ...order(), id: "second-order", historyKey: "2:137:second-order" };
      const callbacks = { onOrderCreated: vi.fn(), onSubmitOrderFailed: vi.fn() };
      let attempts = 0;
      const { store, execute } = setup(async params => {
        const first = attempts++ === 0;
        if (first && phase === "submitting") params.onProgress?.(progress("signing", "request"));
        params.onProgress?.(progress(first ? phase : "signing", "request"));
        const accepted = await (first ? firstResult.promise : secondResult.promise);
        if (!first || phase !== "submitting") params.onProgress?.(progress("signing", "request"));
        params.onProgress?.(progress("submitting", "request"));
        params.onProgress?.(progress("submitting", "accepted", accepted));
        return accepted;
      }, callbacks);

      const first = execute();
      const firstId = store.getState().state.currentExecution.executionId!;
      expect(store.getState().startNewOrder({}, firstId)).toBe(true);
      expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.IDLE);

      const second = execute();
      const current = store.getState().state.currentExecution;
      expect(current.executionId).not.toBe(firstId);
      firstResult.resolve(firstOrder);
      await expect(first).resolves.toBe(firstOrder);

      expect(callbacks.onOrderCreated).toHaveBeenCalledExactlyOnceWith(firstOrder);
      expect(callbacks.onSubmitOrderFailed).not.toHaveBeenCalled();
      expect(store.getState().state.currentExecution).toBe(current);
      expect(store.getState().getExecution(firstId)).toBeUndefined();

      secondResult.resolve(secondOrder);
      await expect(second).resolves.toBe(secondOrder);
      expect(callbacks.onOrderCreated.mock.calls.map(([created]) => created.id))
        .toEqual([firstOrder.id, secondOrder.id]);
      expect(store.getState().state.currentExecution).toMatchObject({
        executionId: current.executionId, phase: ExecutionPhase.SUCCESS, order: secondOrder,
      });
    },
  );

  it("reports a detached failure without changing the new order's execution", async () => {
    const firstResult = deferred<Order>();
    const secondResult = deferred<Order>();
    const failure = new Error("Signing failed");
    const accepted = order();
    const callbacks = { onOrderCreated: vi.fn(), onSubmitOrderFailed: vi.fn() };
    let attempts = 0;
    const { store, execute } = setup(async params => {
      const result = attempts++ === 0 ? firstResult : secondResult;
      params.onProgress?.(progress("signing", "request"));
      const created = await result.promise;
      params.onProgress?.(progress("submitting", "request"));
      params.onProgress?.(progress("submitting", "accepted", created));
      return created;
    }, callbacks);
    const first = execute();
    const firstId = store.getState().state.currentExecution.executionId!;
    expect(store.getState().startNewOrder({}, firstId)).toBe(true);
    const second = execute();
    const current = store.getState().state.currentExecution;

    firstResult.reject(failure);
    await expect(first).rejects.toBe(failure);
    expect(callbacks.onSubmitOrderFailed).toHaveBeenCalledOnce();
    expect(callbacks.onOrderCreated).not.toHaveBeenCalled();
    expect(store.getState().state.currentExecution).toBe(current);
    expect(store.getState().getExecution(firstId)).toBeUndefined();

    secondResult.resolve(accepted);
    await expect(second).resolves.toBe(accepted);
    expect(callbacks.onOrderCreated).toHaveBeenCalledExactlyOnceWith(accepted);
  });

  it("updates the original history cache after the form returns to idle", async () => {
    const accepted = order();
    const updated = { ...accepted, progress: 50 };
    const result = deferred<Order>();
    const callbacks = { onOrderCreated: vi.fn(), onOrdersProgressUpdate: vi.fn() };
    const { store, execute } = setup(async params => {
      params.onProgress?.(progress("signing", "request"));
      params.onProgress?.(progress("submitting", "request"));
      params.onProgress?.(progress("submitting", "accepted", accepted));
      const current = await result.promise;
      params.onProgress?.(progress("submitting", "updated", current));
      return current;
    }, callbacks);
    const pending = execute();
    const firstId = store.getState().state.currentExecution.executionId!;
    expect(store.getState().startNewOrder({}, firstId)).toBe(true);
    expect(store.getState().state.currentExecution.partner).toBeUndefined();

    result.resolve(updated);
    await expect(pending).resolves.toBe(updated);
    expect(store.getState().orders.data).toEqual([updated]);
    expect(callbacks.onOrdersProgressUpdate).toHaveBeenCalledExactlyOnceWith([updated]);
    expect(callbacks.onOrderCreated).toHaveBeenCalledExactlyOnceWith(accepted);
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.IDLE);
  });

  it("reconciles detached unknown acceptance while a new order is still signing", async () => {
    const firstResult = deferred<Order>();
    const secondResult = deferred<Order>();
    const failure = new SpotError("SUBMISSION_FAILED", "Submission response lost", { cause: new Error("Network disconnected") });
    const payload = { nonce: "100", witness: { exchange: { adapter } } };
    const firstOrder = { ...order(), rawOrder: { order: payload } } as Order;
    const secondOrder = { ...order(), id: "second-order", historyKey: "2:137:second-order" };
    const callbacks = { onOrderCreated: vi.fn(), onSubmitOrderFailed: vi.fn() };
    let attempts = 0;
    const { store, client, execute } = setup(async params => {
      const first = attempts++ === 0;
      params.onProgress?.(progress("signing", "request"));
      if (first) {
        params.onProgress?.({ ...progress("signing", "prepared"), preparedOrder: { order: payload } as PreparedOrder });
        params.onProgress?.(progress("submitting", "request"));
      }
      const accepted = await (first ? firstResult.promise : secondResult.promise);
      if (!first) params.onProgress?.(progress("submitting", "request"));
      params.onProgress?.(progress("submitting", "accepted", accepted));
      return accepted;
    }, callbacks);
    const first = execute();
    const firstId = store.getState().state.currentExecution.executionId!;
    expect(store.getState().startNewOrder({}, firstId)).toBe(true);
    const second = execute();
    const current = store.getState().state.currentExecution;

    firstResult.reject(failure);
    await expect(first).rejects.toBe(failure);
    expect(store.getState().getExecution(firstId)?.phase).toBe(ExecutionPhase.UNCONFIRMED);
    vi.mocked(client.getOrders).mockResolvedValueOnce({ orders: [firstOrder], legacyLoaded: false });
    const laterCallbacks = { onOrderCreated: vi.fn() };
    await checkOrderStatus({ store, callbacks: laterCallbacks, signal: new AbortController().signal });

    expect(callbacks.onOrderCreated).toHaveBeenCalledExactlyOnceWith(firstOrder);
    expect(laterCallbacks.onOrderCreated).not.toHaveBeenCalled();
    expect(store.getState().state.currentExecution).toBe(current);
    expect(store.getState().getExecution(firstId)).toBeUndefined();
    expect(client.createOrderExecution).toHaveBeenCalledTimes(2);

    secondResult.resolve(secondOrder);
    await expect(second).resolves.toBe(secondOrder);
    expect(callbacks.onOrderCreated).toHaveBeenCalledTimes(2);
  });

  it("allows a fresh review when the final submission deadline check expires before any POST", async () => {
    const failure = new SpotError("ORDER_EXPIRED", "Order expired before submission");
    const { store, client, execute } = setup(async params => {
      params.onProgress?.(progress("signing", "request"));
      params.onProgress?.(progress("submitting", "request"));
      throw failure;
    });
    await expect(execute()).rejects.toBe(failure);
    const saved = store.getState().state.currentExecution;
    expect(saved.phase).toBe(ExecutionPhase.FAILED);
    expect(client.getOrder).not.toHaveBeenCalled();
    expect(client.getOrders).not.toHaveBeenCalled();
    expect(store.getState().startNewOrder({}, saved.executionId)).toBe(true);
  });

  it("retains the prepared advanced order when submission acceptance becomes unknown", async () => {
    const failure = new SpotError("SUBMISSION_FAILED", "Submission response lost", { cause: new Error("Network disconnected") });
    const callbacks = { onOrderCreated: vi.fn(), onSubmitOrderFailed: vi.fn() };
    const { store, execute } = setup(async params => {
      params.onProgress?.(progress("signing", "request"));
      params.onProgress?.({ ...progress("signing", "prepared"), preparedOrder: prepared });
      params.onProgress?.(progress("submitting", "request"));
      throw failure;
    }, callbacks);
    await expect(execute()).rejects.toBe(failure);
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.UNCONFIRMED, preparedOrder: prepared,
    });
    expect(callbacks.onOrderCreated).not.toHaveBeenCalled();
    expect(callbacks.onSubmitOrderFailed).not.toHaveBeenCalled();
  });

  it("keeps accepted advanced work successful when the runner later reports an error", async () => {
    const accepted = order();
    const callbacks = { onOrderCreated: vi.fn(), onSubmitOrderFailed: vi.fn() };
    const { store, execute } = setup(async params => {
      params.onProgress?.(progress("signing", "request"));
      params.onProgress?.(progress("submitting", "request"));
      params.onProgress?.(progress("submitting", "accepted", accepted));
      throw new Error("Tracking was cancelled after acceptance");
    }, callbacks);
    await expect(execute()).resolves.toEqual(accepted);
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SUCCESS);
    expect(callbacks.onOrderCreated).toHaveBeenCalledOnce();
    expect(callbacks.onSubmitOrderFailed).not.toHaveBeenCalled();
  });

  it("accepts advanced-order acceptance updates without entering settlement", async () => {
    const accepted = { ...order(), type: OrderVariant.TWAP_MARKET };
    const callbacks = { onOrderCreated: vi.fn() };
    const { store, execute } = setup(async (params) => {
      params.onProgress?.(progress("signing", "request"));
      params.onProgress?.(progress("submitting", "request"));
      params.onProgress?.(progress("submitting", "accepted", accepted));
      return accepted;
    }, callbacks);
    await expect(execute(OrderType.TWAP)).resolves.toBe(accepted);
    expect(store.getState().state.currentExecution).toMatchObject({ phase: ExecutionPhase.SUCCESS, order: accepted });
    expect(callbacks.onOrderCreated).toHaveBeenCalledExactlyOnceWith(accepted);
  });

  it("checks a known completed swap once using its captured client and policy", async () => {
    const accepted = order(OrderVariant.SWAP);
    const completed = { ...accepted, status: OrderStatus.Completed, progress: 100 };
    const callbacks = { onOrderCreated: vi.fn(), onOrderFilled: vi.fn() };
    const { store, client } = setup(vi.fn(), callbacks);
    vi.mocked(client.getOrder).mockResolvedValueOnce(completed);
    const foreignReporter = createAnalytics({}, { disableAnalytics: false });
    const foreignRecovery = vi.spyOn(foreignReporter, "onRecoveryRequest");
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client, analytics: foreignReporter, order: accepted, orderId: accepted.id,
    } });
    await expect(checkOrderStatus({ store, callbacks, signal: new AbortController().signal })).resolves.toBe(completed);
    expect(client.getOrder).toHaveBeenCalledExactlyOnceWith({ orderId: accepted.id, signal: expect.any(AbortSignal) });
    expect(client.getOrders).not.toHaveBeenCalled();
    expect(foreignRecovery).not.toHaveBeenCalled();
    expect(store.getState().state.currentExecution.analytics?.isDisabled).toBe(true);
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SUCCESS);
    expect(callbacks.onOrderCreated).not.toHaveBeenCalled();
    expect(callbacks.onOrderFilled).toHaveBeenCalledExactlyOnceWith(completed);
    expect(client.createOrderExecution).not.toHaveBeenCalled();
    expect(client.createSwapExecution).not.toHaveBeenCalled();
  });

  it("recreates only a missing read client with its saved analytics configuration", async () => {
    const accepted = order(OrderVariant.SWAP);
    const completed = { ...accepted, status: OrderStatus.Completed, progress: 100 };
    const { store, client } = setup(vi.fn());
    vi.mocked(client.getOrder).mockResolvedValueOnce(completed);
    vi.mocked(createClient).mockResolvedValueOnce(client);
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, analytics, order: accepted, orderId: accepted.id,
    } });
    await expect(checkOrderStatus({ store, signal: new AbortController().signal })).resolves.toBe(completed);
    expect(createClient).toHaveBeenCalledWith(Partners.Quick, 137, { apiUrl, disableAnalytics: true });
    expect(client.getOrder).toHaveBeenCalledOnce();
    expect(client.createSwapExecution).not.toHaveBeenCalled();
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SUCCESS);
  });

  it("rejects a client with a different original scope without performing a read", async () => {
    const accepted = order(OrderVariant.SWAP);
    const { store, client } = setup(vi.fn());
    const mismatchedClient = { ...client, chainId: 56 };
    const ownerReporter = createAnalytics({}, { disableAnalytics: true });
    vi.spyOn(ownerReporter, "createOperation").mockReturnValueOnce(ownerReporter);
    clientReporters.set(mismatchedClient, ownerReporter);
    const onRecoveryError = vi.spyOn(ownerReporter, "onRecoveryError");
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client: mismatchedClient, analytics, order: accepted, orderId: accepted.id,
    } });
    await expect(checkOrderStatus({ store, signal: new AbortController().signal }))
      .rejects.toThrow("The status client does not match the original order scope");
    expect(client.getOrder).not.toHaveBeenCalled();
    expect(onRecoveryError).toHaveBeenCalledOnce();
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.UNCONFIRMED);
  });

  it.each([OrderStatus.Open, OrderStatus.Cancelled, OrderStatus.Expired])("checks swap status %s without recreating execution", async status => {
    const accepted = order(OrderVariant.SWAP);
    const latest = { ...accepted, status, progress: 25 };
    const { store, client } = setup(vi.fn());
    vi.mocked(client.getOrder).mockResolvedValueOnce(latest);
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client, order: accepted, orderId: accepted.id,
    } });
    await checkOrderStatus({ store, signal: new AbortController().signal });
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: status === OrderStatus.Open ? ExecutionPhase.UNCONFIRMED : ExecutionPhase.FAILED, order: latest,
    });
    expect(client.getOrder).toHaveBeenCalledOnce();
    expect(client.createSwapExecution).not.toHaveBeenCalled();
    expect(client.createOrderExecution).not.toHaveBeenCalled();
  });

  it("retains missing/network results for recovery while a new form is available", async () => {
    const accepted = order(OrderVariant.SWAP);
    const completed = { ...accepted, status: OrderStatus.Completed, progress: 100 };
    const { store, client } = setup(vi.fn());
    vi.mocked(client.getOrder).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce(completed);
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client, order: accepted, orderId: accepted.id,
    } });
    await checkOrderStatus({ store, signal: new AbortController().signal });
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.UNCONFIRMED);
    expect(store.getState().startNewOrder({}, 1)).toBe(true);
    await expect(checkOrderStatus({ store, signal: new AbortController().signal })).rejects.toThrow("Network unavailable");
    expect(store.getState().getExecution(1)).toMatchObject({ phase: ExecutionPhase.UNCONFIRMED, order: accepted });
    await checkOrderStatus({ store, signal: new AbortController().signal });
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.IDLE);
    expect(store.getState().getExecution(1)).toBeUndefined();
    expect(client.getOrder).toHaveBeenCalledTimes(3);
  });

  it.each([
    { id: "different-order" }, { historyKey: "different-history-key" }, { chainId: 56 },
    { maker: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
  ])("keeps a mismatched completed response unconfirmed: %j", async mismatch => {
    const accepted = order(OrderVariant.SWAP);
    const { store, client } = setup(vi.fn());
    vi.mocked(client.getOrder).mockResolvedValueOnce({ ...accepted, status: OrderStatus.Completed, ...mismatch });
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client, order: accepted, orderId: accepted.id,
    } });
    await expect(checkOrderStatus({ store, signal: new AbortController().signal })).rejects.toThrow("does not match the original intent");
    expect(store.getState().state.currentExecution).toMatchObject({ phase: ExecutionPhase.UNCONFIRMED, order: accepted });
  });

  it("reconciles unknown acceptance by the entire signed payload using the original account", async () => {
    const accepted = order(OrderVariant.SWAP);
    const payload = { nonce: "100", witness: { exchange: { adapter } } };
    accepted.rawOrder = { order: payload } as Order["rawOrder"];
    const different = { ...accepted, id: "different", rawOrder: { order: { ...payload, nonce: "101" } } } as Order;
    const callbacks = { onOrderCreated: vi.fn() };
    const { store, client } = setup(vi.fn(), callbacks);
    vi.mocked(client.getOrders).mockResolvedValueOnce({ orders: [different, accepted], legacyLoaded: false });
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client, preparedOrder: { order: payload } as PreparedOrder,
    } });
    await checkOrderStatus({ store, callbacks, signal: new AbortController().signal });
    expect(client.getOrders).toHaveBeenCalledExactlyOnceWith({ account, legacyOrders: false, getv1orders: false, rejectInvalidOrders: true, signal: expect.any(AbortSignal) });
    expect(store.getState().state.currentExecution).toMatchObject({ phase: ExecutionPhase.UNCONFIRMED, order: accepted });
    expect(callbacks.onOrderCreated).toHaveBeenCalledExactlyOnceWith(accepted);
    expect(client.getOrder).not.toHaveBeenCalled();
    expect(client.createSwapExecution).not.toHaveBeenCalled();
  });

  it("treats a short LIMIT intent as accepted even when the returned variant resembles a swap", async () => {
    const accepted = order(OrderVariant.SWAP);
    const { store, client } = setup(vi.fn());
    vi.mocked(client.getOrder).mockResolvedValueOnce(accepted);
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client, form: form(OrderType.LIMIT), order: accepted, orderId: accepted.id,
    } });
    await checkOrderStatus({ store, signal: new AbortController().signal });
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SUCCESS);
    expect(client.createOrderExecution).not.toHaveBeenCalled();
  });

  it.each([true, false])("retains missing submissions independently of signed expiry while allowing explicit detachment: expired=%s", async expired => {
    const callbacks = { onSubmitOrderFailed: vi.fn() };
    const { store, client } = setup(vi.fn(), callbacks);
    const payload = { deadline: Math.floor((Date.now() + (expired ? -60_000 : 60_000)) / 1000).toString() };
    vi.mocked(client.getOrders).mockResolvedValueOnce({ orders: [], legacyLoaded: false });
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client, preparedOrder: { order: payload } as PreparedOrder,
    } });
    await checkOrderStatus({ store, callbacks });
    expect(client.getOrders).toHaveBeenCalledExactlyOnceWith({ account, legacyOrders: false, getv1orders: false, rejectInvalidOrders: true, signal: expect.any(AbortSignal) });
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.UNCONFIRMED);
    expect(callbacks.onSubmitOrderFailed).not.toHaveBeenCalled();
    expect(store.getState().startNewOrder({}, 1)).toBe(true);
    expect(store.getState().getExecution(1)?.phase).toBe(ExecutionPhase.UNCONFIRMED);
  });

  it.each([OrderType.LIMIT, OrderType.TWAP])("allows a separate %s order during a history outage without waiting for a weeks-long deadline", async orderType => {
    const callbacks = { onOrderCreated: vi.fn(), onSubmitOrderFailed: vi.fn() };
    const { store, client } = setup(vi.fn(), callbacks);
    const payload = {
      nonce: "long-lived-intent", deadline: Math.floor((Date.now() + 21 * 86_400_000) / 1000).toString(),
      witness: { exchange: { adapter } },
    };
    const accepted = { ...order(), rawOrder: { order: payload } } as Order;
    const first = store.getState().beginExecution({
      account, chainId: 137, partner: Partners.Quick, apiUrl, client, form: form(orderType),
      callbacks, preparedOrder: { order: payload } as unknown as PreparedOrder,
    })!;
    for (const phase of [ExecutionPhase.SIGNING, ExecutionPhase.SUBMITTING, ExecutionPhase.UNCONFIRMED]) {
      store.getState().replaceExecution(first.executionId, { ...first, phase });
    }
    vi.mocked(client.getOrders).mockRejectedValueOnce(new Error("History unavailable"));
    await expect(checkOrderStatus({ store })).rejects.toThrow("History unavailable");
    expect(store.getState().startNewOrder({}, first.executionId)).toBe(true);
    const next = store.getState().beginExecution({ account, chainId: 137, client, form: form(orderType) })!;
    expect(next.executionId).not.toBe(first.executionId);
    expect(store.getState().getExecution(first.executionId)).toMatchObject({
      phase: ExecutionPhase.UNCONFIRMED, preparedOrder: { order: payload }, client,
    });

    vi.mocked(client.getOrders).mockResolvedValueOnce({ orders: [accepted], legacyLoaded: false });
    await expect(checkOrderStatus({ store })).resolves.toBe(accepted);
    expect(store.getState().state.currentExecution).toBe(next);
    expect(store.getState().getExecution(first.executionId)).toBeUndefined();
    expect(callbacks.onOrderCreated).toHaveBeenCalledExactlyOnceWith(accepted);
    expect(callbacks.onSubmitOrderFailed).not.toHaveBeenCalled();
    expect(client.createOrderExecution).not.toHaveBeenCalled();
  });

  it("retains an expired unknown submission for recovery when its current-service lookup fails", async () => {
    const { store, client } = setup(vi.fn());
    vi.mocked(client.getOrders).mockRejectedValueOnce(new Error("Current order service unavailable"));
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client,
      preparedOrder: { order: { deadline: "1" } } as PreparedOrder,
    } });
    await expect(checkOrderStatus({ store })).rejects.toThrow("Current order service unavailable");
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.UNCONFIRMED);
    expect(store.getState().startNewOrder({}, 1)).toBe(true);
    expect(store.getState().getExecution(1)?.phase).toBe(ExecutionPhase.UNCONFIRMED);
  });

  it("keeps an expired unknown submission locked when strict history parsing rejects a malformed response", async () => {
    const callbacks = { onSubmitOrderFailed: vi.fn() };
    const { store, client } = setup(vi.fn(), callbacks);
    const failure = new SpotError("INVALID_RESPONSE", "Order history contains an invalid order");
    vi.mocked(client.getOrders).mockRejectedValueOnce(failure);
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client, preparedOrder: { order: { deadline: "1" } } as PreparedOrder,
    } });
    await expect(checkOrderStatus({ store, callbacks })).rejects.toBe(failure);
    expect(client.getOrders).toHaveBeenCalledExactlyOnceWith({ account, legacyOrders: false,
      getv1orders: false, rejectInvalidOrders: true, signal: expect.any(AbortSignal) });
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.UNCONFIRMED);
    expect(callbacks.onSubmitOrderFailed).not.toHaveBeenCalled();
    expect(store.getState().startNewOrder({}, 1)).toBe(true);
    expect(store.getState().getExecution(1)?.phase).toBe(ExecutionPhase.UNCONFIRMED);
  });

  it.each(["saved", "sdk", "cache", "id"] as const)("does not expire a known accepted order missing from a later read: %s", async source => {
    const { store, client } = setup(vi.fn());
    const payload = { deadline: "1", witness: { exchange: { adapter } } };
    const accepted = { ...order(OrderVariant.SWAP), rawOrder: { order: payload } } as Order;
    vi.mocked(client.getOrder).mockResolvedValueOnce(undefined);
    if (source === "cache") store.getState().addOrder(accepted);
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client, preparedOrder: { order: payload } as PreparedOrder,
      ...(source === "saved" ? { order: accepted } : {}),
      ...(source === "sdk" ? { sdkExecution: { order: accepted } as unknown as ReturnType<SpotClient["createOrderExecution"]> } : {}),
      ...(source === "id" ? { orderId: accepted.id } : {}),
    } });
    await checkOrderStatus({ store });
    expect(client.getOrder).toHaveBeenCalledExactlyOnceWith({ orderId: accepted.id, signal: expect.any(AbortSignal) });
    expect(client.getOrders).not.toHaveBeenCalled();
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.UNCONFIRMED);
    expect(store.getState().startNewOrder({}, 1)).toBe(true);
    expect(store.getState().getExecution(1)?.phase).toBe(ExecutionPhase.UNCONFIRMED);
  });
});

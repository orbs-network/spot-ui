import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateOrder,
  Module,
  OrderSettlementError,
  OrderStatus,
  OrderType,
  Partners,
  type ExecutedOrder,
  type Order,
  type PreparedOrder,
  type ResumeOrderParams,
  type SpotClient,
  type SwapQuote,
} from "@orbs-network/spot-ui";
import {
  createAnalytics,
  createClientWithAnalytics,
  executeClientOrder,
  resumeClientOrder,
  type InternalExecuteOrderParams,
  type OrderExecutionUpdate,
  type SpotAnalytics,
} from "@orbs-network/spot-ui/internal";
import { createSpotStore } from "../src/context/create-spot-store";
import { executeOrder, type ExecuteOrderParams } from "../src/execute-order";
import { resumeExecution } from "../src/resume-execution";
import { ExecutionPhase, type Callbacks, type Token, type WalletInteractions } from "../src/types";
import { updateTrackedOrderInCache } from "../src/wait-for-swap-order";
import { getSubmitButtonState } from "../src/submit-button-state";
import { createOperationAnalytics } from "../src/analytics";

const executionRunners = vi.hoisted(() => new WeakMap<SpotClient, (params: InternalExecuteOrderParams) => Promise<ExecutedOrder>>());
type ResumeControls = { analytics?: SpotAnalytics; onUpdate?: (order: Order) => void };
const resumeRunners = vi.hoisted(() => new WeakMap<SpotClient, (params: ResumeOrderParams, controls?: ResumeControls) => Promise<Order>>());
const clientReporters = vi.hoisted(() => new WeakMap<SpotClient, SpotAnalytics>());

vi.mock("@orbs-network/spot-ui/internal", async (importOriginal) => ({
  ...await importOriginal<typeof import("@orbs-network/spot-ui/internal")>(),
  executeClientOrder: vi.fn((client: SpotClient, params: InternalExecuteOrderParams) => {
    const run = executionRunners.get(client);
    if (!run) throw new Error("No internal execution runner configured for this client");
    return run(params);
  }),
  resumeClientOrder: vi.fn((client: SpotClient, params: ResumeOrderParams, controls?: ResumeControls) => {
    const resume = resumeRunners.get(client);
    if (!resume) throw new Error("No internal resume runner configured for this client");
    return resume(params, controls);
  }),
  createClientWithAnalytics: vi.fn(),
  getClientAnalytics: vi.fn((client: SpotClient) => {
    const reporter = clientReporters.get(client);
    if (!reporter) throw new Error("No internal analytics reporter configured for this client");
    return reporter;
  }),
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

const form = (module = Module.SWAP) => calculateOrder({
  module, inputTokenDecimals: 0, outputTokenDecimals: 0,
  quotedOutputAmountRaw: "20", minimumOutputAmountRaw: "18",
  inputBalanceRaw: "100", inputTokenUsdPrice: "1", outputTokenUsdPrice: "1",
  minTradeSizeUsd: 1, priceProtectionPercent: 5,
  userInput: { inputAmountUi: "10", isMarketOrder: module !== Module.SWAP, tradeCount: 2 },
});

const quote = (): SwapQuote => ({
  request: {
    chainId: 137, partner: Partners.Quick, inToken: inputAddress,
    outToken: outputAddress, inAmount: "10", user: account, slippage: 0.5,
  },
  receivedAt: Date.now(), amountOut: "20", netAmountOut: "20",
  minimumAmountOut: "18", feeAmount: "0",
});

const order = (): Order => ({
  id: "accepted-order", historyKey: "2:137:accepted-order", chainId: 137,
  maker: account, type: OrderType.SWAP, status: OrderStatus.Open, progress: 0,
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

const setup = (run: (params: InternalExecuteOrderParams) => Promise<ExecutedOrder>, callbacks: Callbacks = {}) => {
  const store = createSpotStore({});
  const client = { partner: Partners.Quick, chainId: 137, apiUrl, executeOrder: vi.fn() } as unknown as SpotClient;
  executionRunners.set(client, run);
  clientReporters.set(client, analytics);
  store.getState().configureOrders(JSON.stringify([account, adapter, Partners.Quick, 137, true]), undefined, callbacks);
  const execute = (
    module = Module.SWAP,
    overrides: Partial<Pick<ExecuteOrderParams, "inputToken" | "wrappedNativeToken" | "walletInteractions">> = {},
  ) => executeOrder({
    account, chainId: 137, inputToken, outputToken, form: form(module), quote: quote(), client,
    walletInteractions: {} as WalletInteractions, callbacks, disableAnalytics: true,
    addNewOrder: store.getState().addOrder, refetchActiveOrders: vi.fn(),
    onOrderUpdate: (current) => updateTrackedOrderInCache(store, current, callbacks),
    subscribeExecution: (listener) => store.subscribe(listener),
    getCurrentExecution: () => store.getState().state.currentExecution,
    beginExecution: store.getState().beginExecution, replaceExecution: store.getState().replaceExecution,
    ...overrides,
  });
  return { store, client, execute };
};

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

  it.each([
    "0x0000000000000000000000000000000000000000",
    "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "0x0000000000000000000000000000000000001010",
  ])("normalizes native input %s and retains wrapping progress in the reviewed flow", async (address) => {
    const accepted = order();
    const callbacks = { onWrapRequest: vi.fn(), onWrapSuccess: vi.fn(), onOrderCreated: vi.fn() };
    const run = vi.fn(async (params: InternalExecuteOrderParams) => {
      params.onUpdate?.({ ...progress("wrapping", "request"), steps: ["wrap", "create"], hasApproval: false, wrapAmountRaw: "10" });
      params.onUpdate?.({ ...progress("wrapping", "success"), steps: ["wrap", "create"], stepIndex: 1, wrapTxHash: "0xwrap", wrapAmountRaw: "10" });
      params.onUpdate?.({ ...progress("signing", "request"), wrapTxHash: "0xwrap" });
      params.onUpdate?.({ ...progress("submitting", "request"), wrapTxHash: "0xwrap" });
      params.onUpdate?.({ ...progress("settling", "accepted", accepted), wrapTxHash: "0xwrap" });
      return { order: accepted, preparedOrder: prepared, wrapTxHash: "0xwrap" };
    });
    const { store, client, execute } = setup(run, callbacks);
    const walletInteractions = {
      shouldWrap: vi.fn().mockReturnValue(true), wrapNativeToken: vi.fn(),
      approveToken: vi.fn(), signOrder: vi.fn(), getAllowance: vi.fn(), cancelOrder: vi.fn(),
    } as WalletInteractions;
    const nativeToken = { ...inputToken, address };
    vi.mocked(executeClientOrder).mockClear();

    await expect(execute(Module.SWAP, { inputToken: nativeToken, wrappedNativeToken: inputToken, walletInteractions }))
      .resolves.toBe(accepted);

    expect(executeClientOrder).toHaveBeenCalledWith(client, expect.objectContaining({
      inputTokenAddress: inputAddress, walletInteractions,
    }));
    expect(run).toHaveBeenCalledOnce();
    expect(client.executeOrder).not.toHaveBeenCalled();
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
      module: Module.SWAP, quote: quote(), inputToken: { ...inputToken, address: "0x0000000000000000000000000000000000000000" },
      outputToken, inputBalanceRaw: "100", noLiquidity: false, inputAmountUi: "10",
      marketPriceLoading: false, hasChainId: true, form: form(), hasClient: true,
      isClientLoading: false, executionPhase: ExecutionPhase.IDLE,
    };
    expect(getSubmitButtonState({ ...inputs, wrappedNativeToken: inputToken }))
      .toEqual({ disabled: false, loading: false });
    expect(getSubmitButtonState({ ...inputs, wrappedNativeToken: undefined }))
      .toEqual({ disabled: true, loading: false, disabledReason: "missing-wrapped-native-token" });
  });

  it("retains a completed wrap when dismissing a failed attempt and passes it to the SDK retry", async () => {
    const nativeToken = { ...inputToken, address: "0x0000000000000000000000000000000000000000" };
    const accepted = order();
    const run = vi.fn(async (params: InternalExecuteOrderParams) => {
      params.onUpdate?.(progress("signing", "request"));
      params.onUpdate?.(progress("submitting", "request"));
      params.onUpdate?.(progress("settling", "accepted", accepted));
      return { order: accepted, preparedOrder: prepared };
    });
    const { store, execute } = setup(run);
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.FAILED,
      completedWrap: { account, chainId: 137, inputTokenAddress: nativeToken.address, inputAmountRaw: "10", txHash: "0xconfirmed" },
    } });
    expect(store.getState().returnToOrderForm(1)).toBe(true);
    await execute(Module.SWAP, { inputToken: nativeToken, wrappedNativeToken: inputToken });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ completedWrapTxHash: "0xconfirmed" }));
  });

  it("retains acceptance before completion, updates the cache, and creates only one order callback", async () => {
    const accepted = order();
    const completed = { ...accepted, status: OrderStatus.Completed, progress: 100 };
    const settlement = deferred<Order>();
    const callbacks = { onOrderCreated: vi.fn(), onOrderFilled: vi.fn() };
    const run = vi.fn(async (params: InternalExecuteOrderParams) => {
      params.onUpdate?.(progress("signing", "request"));
      params.onUpdate?.(progress("submitting", "request"));
      params.onUpdate?.(progress("settling", "accepted", accepted));
      const result = await settlement.promise;
      params.onUpdate?.(progress("settling", "updated", result));
      return { order: result, preparedOrder: prepared };
    });
    const { store, client, execute } = setup(run, callbacks);
    const execution = execute();
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.SETTLING, orderId: accepted.id, order: accepted, client,
    });
    expect(callbacks.onOrderCreated).toHaveBeenCalledExactlyOnceWith(accepted);
    settlement.resolve(completed);
    await expect(execution).resolves.toBe(completed);
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SUCCESS);
    expect(store.getState().orders.data).toEqual([completed]);
    expect(callbacks.onOrderCreated).toHaveBeenCalledOnce();
    expect(callbacks.onOrderFilled).toHaveBeenCalledExactlyOnceWith(completed);
    expect(run).toHaveBeenCalledOnce();
    expect(client.executeOrder).not.toHaveBeenCalled();
  });

  it("preserves the latest accepted order when settlement becomes unconfirmed", async () => {
    const accepted = order();
    const latest = { ...accepted, progress: 25 };
    const failure = new OrderSettlementError("Tracking stopped", "unconfirmed", accepted.id);
    failure.order = latest;
    const callbacks = { onOrderCreated: vi.fn(), onSubmitOrderFailed: vi.fn() };
    const { store, execute } = setup(async (params) => {
      params.onUpdate?.(progress("signing", "request"));
      params.onUpdate?.(progress("submitting", "request"));
      params.onUpdate?.(progress("settling", "accepted", accepted));
      params.onUpdate?.(progress("settling", "updated", latest));
      throw failure;
    }, callbacks);
    await expect(execute()).rejects.toBe(failure);
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.UNCONFIRMED, orderId: accepted.id, order: latest,
    });
    expect(callbacks.onOrderCreated).toHaveBeenCalledOnce();
    expect(callbacks.onSubmitOrderFailed).not.toHaveBeenCalled();
  });

  it("accepts advanced-order acceptance updates without entering settlement", async () => {
    const accepted = { ...order(), type: OrderType.TWAP_MARKET };
    const callbacks = { onOrderCreated: vi.fn() };
    const { store, execute } = setup(async (params) => {
      params.onUpdate?.(progress("signing", "request"));
      params.onUpdate?.(progress("submitting", "request"));
      params.onUpdate?.(progress("submitting", "accepted", accepted));
      return { order: accepted, preparedOrder: prepared };
    }, callbacks);
    await expect(execute(Module.TWAP)).resolves.toBe(accepted);
    expect(store.getState().state.currentExecution).toMatchObject({ phase: ExecutionPhase.SUCCESS, order: accepted });
    expect(callbacks.onOrderCreated).toHaveBeenCalledExactlyOnceWith(accepted);
  });

  it("resumes with the captured client through private tracking controls", async () => {
    const accepted = order();
    const completed = { ...accepted, status: OrderStatus.Completed, progress: 100 };
    const callbacks = { onOrderCreated: vi.fn(), onOrderFilled: vi.fn() };
    const { store, client } = setup(vi.fn(), callbacks);
    const resume = vi.fn(async (_params: ResumeOrderParams, controls?: ResumeControls) => {
      controls?.onUpdate?.(completed);
      return completed;
    });
    resumeRunners.set(client, resume);
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client, analytics, form: form(), order: accepted, orderId: accepted.id,
    } });
    await expect(resumeExecution({ store, callbacks, signal: new AbortController().signal })).resolves.toBe(completed);
    expect(resume).toHaveBeenCalledOnce();
    expect(resume.mock.calls[0]![0]).toMatchObject({ order: accepted });
    expect(resume.mock.calls[0]![1]).toMatchObject({ analytics });
    expect(resume.mock.calls[0]![0]).not.toHaveProperty("analytics");
    expect(resume.mock.calls[0]![0]).not.toHaveProperty("onUpdate");
    expect(resume.mock.calls[0]![0]).not.toHaveProperty("walletInteractions");
    expect(resume.mock.calls[0]![0]).not.toHaveProperty("form");
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SUCCESS);
    expect(callbacks.onOrderCreated).not.toHaveBeenCalled();
    expect(callbacks.onOrderFilled).toHaveBeenCalledExactlyOnceWith(completed);
    expect(client.executeOrder).not.toHaveBeenCalled();
  });

  it("recreates a missing recovery client with the saved private analytics policy", async () => {
    const accepted = order();
    const completed = { ...accepted, status: OrderStatus.Completed, progress: 100 };
    const { store, client } = setup(vi.fn());
    const resume = vi.fn(async () => completed);
    resumeRunners.set(client, resume);
    vi.mocked(createClientWithAnalytics).mockResolvedValueOnce(client);
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, analytics, form: form(), order: accepted, orderId: accepted.id,
    } });

    await expect(resumeExecution({ store, signal: new AbortController().signal })).resolves.toBe(completed);

    expect(createClientWithAnalytics).toHaveBeenCalledWith(Partners.Quick, 137, { apiUrl }, analytics);
    expect(resumeClientOrder).toHaveBeenCalledWith(client,
      expect.objectContaining({ order: accepted }), expect.objectContaining({ analytics }));
    expect(resume).toHaveBeenCalledOnce();
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.SUCCESS);
  });

  it("reports a recovery scope failure before SDK tracking starts", async () => {
    const accepted = order();
    const run = vi.fn();
    const { store, client } = setup(run);
    const onRecoveryError = vi.spyOn(analytics, "onRecoveryError");
    store.getState().updateState({ currentExecution: {
      executionId: 1, phase: ExecutionPhase.UNCONFIRMED, account, chainId: 137,
      partner: Partners.Quick, apiUrl, client: { ...client, chainId: 56 }, analytics,
      form: form(), order: accepted, orderId: accepted.id,
    } });
    await expect(resumeExecution({ store, signal: new AbortController().signal }))
      .rejects.toThrow("The recovery client does not match the original order scope");
    expect(run).not.toHaveBeenCalled();
    expect(onRecoveryError).toHaveBeenCalledOnce();
    expect(store.getState().state.currentExecution).toMatchObject({
      phase: ExecutionPhase.UNCONFIRMED, orderId: accepted.id, order: accepted,
    });
  });
});

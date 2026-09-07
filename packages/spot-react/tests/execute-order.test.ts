import { describe, expect, it, vi } from "vitest";
import {
  type Address,
  type CalculatedOrderForm,
  type Order,
  type PreparedOrder,
  type SpotClient,
} from "@orbs-network/spot-ui";
import { executeOrder, type ExecuteOrderParams } from "../src/execute-order";
import { createSpotStore } from "../src/context/spot-store";
import {
  ExecutionPhase,
  type Callbacks,
  type Token,
  type WalletInteractions,
} from "../src/types";

const ACCOUNT = "0x0000000000000000000000000000000000000001" as Address;
const SPENDER = "0x0000000000000000000000000000000000000002" as Address;
const SIGNATURE = `0x${"11".repeat(65)}` as `0x${string}`;
const WRAP_HASH = `0x${"22".repeat(32)}` as `0x${string}`;
const APPROVE_HASH = `0x${"33".repeat(32)}` as `0x${string}`;
const MAX_ALLOWANCE = "1000000000000000000000000000000";

const inputToken: Token = {
  address: "0x0000000000000000000000000000000000000010",
  symbol: "IN",
  decimals: 18,
  logoUrl: "",
};
const nativeInputToken: Token = {
  ...inputToken,
  address: "0x0000000000000000000000000000000000000000",
  symbol: "ETH",
};
const outputToken: Token = {
  address: "0x0000000000000000000000000000000000000020",
  symbol: "OUT",
  decimals: 18,
  logoUrl: "",
};

const order = {
  id: "order-1",
  historyKey: "2:order-1",
} as Order;

const createForm = (canSubmit = true): CalculatedOrderForm =>
  ({
    canSubmit,
    inputAmount: { raw: "100", ui: "0.0000000000000001", usd: "" },
    values: { slippageBps: 300 },
  }) as CalculatedOrderForm;

const createPreparedOrder = (form: CalculatedOrderForm): PreparedOrder =>
  ({
    form,
    signingRequest: {
      signerAddress: ACCOUNT,
      typedData: {},
    },
    values: {
      inputAmount: form.inputAmount.raw,
      inputAmountPerTrade: form.inputAmount.raw,
      triggerOutputAmountPerTrade: "0",
      minOutputAmountPerTrade: "90",
      deadlineMillis: 1,
      fillDelayMillis: 1,
      slippageBps: 300,
      isMarketOrder: true,
      totalTrades: 1,
    },
  }) as PreparedOrder;

const createClient = (form: CalculatedOrderForm): SpotClient => {
  const preparedOrder = createPreparedOrder(form);
  return {
    spenderAddress: SPENDER,
    prepareOrder: vi.fn(() => preparedOrder),
    signOrder: vi.fn((_preparedOrder, signer) =>
      signer(preparedOrder.signingRequest),
    ),
    submitOrder: vi.fn(async () => order),
  } as unknown as SpotClient;
};

const createWallet = (): WalletInteractions => ({
  cancelOrder: vi.fn(async () => WRAP_HASH),
  signOrder: vi.fn(async () => SIGNATURE),
  wrapNativeToken: vi.fn(async () => WRAP_HASH),
  approveToken: vi.fn(async () => APPROVE_HASH),
  getAllowance: vi.fn(async () => MAX_ALLOWANCE),
});

const createParams = (
  overrides: Partial<ExecuteOrderParams> = {},
): ExecuteOrderParams & { returnToOrderForm: () => boolean } => {
  const store = createSpotStore({});
  const form = overrides.form ?? createForm();
  const client = overrides.client ?? createClient(form);
  const walletInteractions =
    overrides.walletInteractions ?? createWallet();

  return {
    account: ACCOUNT,
    chainId: 1,
    isSupportedChain: true,
    inputToken,
    outputToken,
    form,
    client,
    walletInteractions,
    addNewOrder: vi.fn(),
    refetchActiveOrders: vi.fn(),
    getCurrentExecution: () => store.getState().state.currentExecution,
    beginExecution: store.getState().beginExecution,
    replaceExecution: store.getState().replaceExecution,
    returnToOrderForm: store.getState().returnToOrderForm,
    wait: async () => undefined,
    ...overrides,
  };
};

describe("execution store", () => {
  it("rejects resets and duplicate starts while an execution is active", () => {
    const store = createSpotStore({ typedTrades: 5 });
    const first = store.getState().beginExecution({});

    expect(first?.phase).toBe(ExecutionPhase.PREPARING);
    expect(store.getState().returnToOrderForm()).toBe(false);
    expect(store.getState().startNewOrder({ typedTrades: 1 })).toBe(false);
    expect(store.getState().beginExecution({})).toBeUndefined();
    expect(store.getState().state.currentExecution).toBe(first);
  });

  it("ignores stale writes from an older execution attempt", () => {
    const store = createSpotStore({});
    const first = store.getState().beginExecution({});
    expect(first?.executionId).toBeDefined();
    expect(
      store.getState().replaceExecution(first!.executionId!, {
        ...first!,
        phase: ExecutionPhase.FAILED,
      }),
    ).toBe(true);

    const second = store.getState().beginExecution({});
    expect(second?.executionId).toBeDefined();
    expect(second?.executionId).not.toBe(first?.executionId);
    expect(
      store.getState().replaceExecution(first!.executionId!, {
        ...first!,
        phase: ExecutionPhase.FAILED,
      }),
    ).toBe(false);
    expect(store.getState().state.currentExecution).toBe(second);
  });

  it("replaces terminal retry state instead of merging old progress", () => {
    const store = createSpotStore({});
    const first = store.getState().beginExecution({});
    expect(
      store.getState().replaceExecution(first!.executionId!, {
        ...first!,
        phase: ExecutionPhase.FAILED,
        error: new Error("first attempt"),
        parsedError: { message: "first attempt", code: 10 },
        approveTxHash: APPROVE_HASH,
        orderId: "old-order",
        stepIndex: 2,
      }),
    ).toBe(true);

    const retry = store.getState().beginExecution({});
    expect(retry?.phase).toBe(ExecutionPhase.PREPARING);
    expect(retry?.error).toBeUndefined();
    expect(retry?.parsedError).toBeUndefined();
    expect(retry?.approveTxHash).toBeUndefined();
    expect(retry?.orderId).toBeUndefined();
    expect(retry?.stepIndex).toBeUndefined();
  });
});

describe("executeOrder", () => {
  it("admits only one submission when called twice", async () => {
    let resolveAllowance: ((allowance: string) => void) | undefined;
    const wallet = createWallet();
    vi.mocked(wallet.getAllowance).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAllowance = resolve;
        }),
    );
    const params = createParams({ walletInteractions: wallet });
    const client = params.client!;

    const first = executeOrder(params);
    const second = executeOrder(params);

    await expect(second).resolves.toBeUndefined();
    expect(client.prepareOrder).not.toHaveBeenCalled();
    resolveAllowance?.(MAX_ALLOWANCE);
    await expect(first).resolves.toBe(order);
    expect(client.prepareOrder).toHaveBeenCalledTimes(1);
    expect(client.submitOrder).toHaveBeenCalledTimes(1);
  });

  it("uses the calculated raw input amount for allowance checks", async () => {
    const wallet = createWallet();
    vi.mocked(wallet.getAllowance).mockResolvedValue("100");
    const params = createParams({ walletInteractions: wallet });

    await expect(executeOrder(params)).resolves.toBe(order);
    expect(wallet.approveToken).not.toHaveBeenCalled();
  });

  it("prepares fresh signing data after wrapping and approval", async () => {
    const wallet = createWallet();
    vi.mocked(wallet.getAllowance)
      .mockResolvedValueOnce("0")
      .mockResolvedValue(MAX_ALLOWANCE);
    const params = createParams({
      inputToken: nativeInputToken,
      walletInteractions: wallet,
    });
    const client = params.client!;

    await expect(executeOrder(params)).resolves.toBe(order);

    expect(wallet.wrapNativeToken).toHaveBeenCalledTimes(1);
    expect(wallet.approveToken).toHaveBeenCalledTimes(1);
    expect(client.prepareOrder).toHaveBeenCalledTimes(1);
    expect(wallet.signOrder).toHaveBeenCalledWith(
      params.getCurrentExecution().preparedOrder?.signingRequest,
    );
    expect(
      vi.mocked(wallet.approveToken).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(client.prepareOrder).mock.invocationCallOrder[0],
    );
    expect(
      vi.mocked(client.prepareOrder).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(client.signOrder).mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["wrap", nativeInputToken, "wrapNativeToken"],
    ["approval", inputToken, "approveToken"],
    ["signing", inputToken, "signOrder"],
  ] as const)(
    "records provider rejection during %s",
    async (_label, selectedInputToken, rejectedMethod) => {
      const wallet = createWallet();
      if (rejectedMethod === "approveToken") {
        vi.mocked(wallet.getAllowance).mockResolvedValue("0");
      }
      vi.mocked(wallet[rejectedMethod]).mockRejectedValue({ code: 4001 });
      const onSubmitOrderRejected = vi.fn();
      const onSubmitOrderFailed = vi.fn();
      const params = createParams({
        inputToken: selectedInputToken,
        walletInteractions: wallet,
        callbacks: { onSubmitOrderRejected, onSubmitOrderFailed },
      });

      await expect(executeOrder(params)).rejects.toThrow("Unknown error");
      expect(params.getCurrentExecution().phase).toBe(
        ExecutionPhase.REJECTED,
      );
      expect(onSubmitOrderRejected).toHaveBeenCalledTimes(1);
      expect(onSubmitOrderFailed).not.toHaveBeenCalled();
    },
  );

  it("retries without wrapping a completed native-token amount twice", async () => {
    const wallet = createWallet();
    vi.mocked(wallet.getAllowance)
      .mockResolvedValueOnce("0")
      .mockResolvedValue(MAX_ALLOWANCE);
    vi.mocked(wallet.approveToken)
      .mockRejectedValueOnce(new Error("approval failed"))
      .mockResolvedValue(APPROVE_HASH);
    const params = createParams({
      inputToken: nativeInputToken,
      walletInteractions: wallet,
    });

    await expect(executeOrder(params)).rejects.toThrow("approval failed");
    expect(params.getCurrentExecution().completedWrap?.txHash).toBe(WRAP_HASH);
    expect(params.returnToOrderForm()).toBe(true);
    expect(params.getCurrentExecution().phase).toBe(ExecutionPhase.IDLE);

    const retry = executeOrder(params);
    expect(params.getCurrentExecution().phase).toBe(ExecutionPhase.PREPARING);
    expect(params.getCurrentExecution().error).toBeUndefined();
    await expect(retry).resolves.toBe(order);
    expect(wallet.wrapNativeToken).toHaveBeenCalledTimes(1);
  });

  it("reuses a completed native wrap for a smaller retry amount", async () => {
    const wallet = createWallet();
    vi.mocked(wallet.getAllowance)
      .mockResolvedValueOnce("0")
      .mockResolvedValue(MAX_ALLOWANCE);
    vi.mocked(wallet.approveToken)
      .mockRejectedValueOnce(new Error("approval failed"))
      .mockResolvedValue(APPROVE_HASH);
    const firstForm = createForm();
    const params = createParams({
      form: firstForm,
      client: createClient(firstForm),
      inputToken: nativeInputToken,
      walletInteractions: wallet,
    });

    await expect(executeOrder(params)).rejects.toThrow("approval failed");
    expect(params.returnToOrderForm()).toBe(true);

    const smallerForm = {
      ...firstForm,
      inputAmount: { ...firstForm.inputAmount, raw: "50" },
    };
    params.form = smallerForm;
    params.client = createClient(smallerForm);

    await expect(executeOrder(params)).resolves.toBe(order);
    expect(wallet.wrapNativeToken).toHaveBeenCalledTimes(1);
  });

  it("isolates synchronous and asynchronous observer failures", async () => {
    const wallet = createWallet();
    vi.mocked(wallet.getAllowance)
      .mockResolvedValueOnce("0")
      .mockResolvedValue(MAX_ALLOWANCE);
    const callbackError = new Error("observer failed");
    const callbacks: Callbacks = {
      onWrapRequest: () => {
        throw callbackError;
      },
      onWrapSuccess: async () => {
        throw callbackError;
      },
      onApproveRequest: () => {
        throw callbackError;
      },
      onApproveSuccess: async () => {
        throw callbackError;
      },
      onSignOrderRequest: () => {
        throw callbackError;
      },
      onSignOrderSuccess: async () => {
        throw callbackError;
      },
      onOrderCreated: () => {
        throw callbackError;
      },
    };
    const addNewOrder = vi.fn();
    const params = createParams({
      inputToken: nativeInputToken,
      walletInteractions: wallet,
      callbacks,
      addNewOrder,
      refetchActiveOrders: () => Promise.reject(callbackError),
    });

    await expect(executeOrder(params)).resolves.toBe(order);
    await Promise.resolve();
    expect(params.getCurrentExecution().phase).toBe(ExecutionPhase.SUCCESS);
    expect(addNewOrder).toHaveBeenCalledWith(order);
  });

  it("rejects an invalid form before preparing or invoking the wallet", async () => {
    const form = createForm(false);
    const client = createClient(form);
    const wallet = createWallet();
    const onSubmitOrderFailed = vi.fn();
    const params = createParams({
      form,
      client,
      walletInteractions: wallet,
      callbacks: { onSubmitOrderFailed },
    });

    await expect(executeOrder(params)).rejects.toThrow(
      "Order form is not submittable",
    );
    expect(params.getCurrentExecution().phase).toBe(ExecutionPhase.FAILED);
    expect(client.prepareOrder).not.toHaveBeenCalled();
    expect(wallet.getAllowance).not.toHaveBeenCalled();
    expect(wallet.signOrder).not.toHaveBeenCalled();
    expect(onSubmitOrderFailed).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Order form is not submittable" }),
    );
  });

  it("rejects a fractional base-unit amount with a useful error", async () => {
    const form = {
      ...createForm(),
      inputAmount: { raw: "1.5", ui: "", usd: "" },
    };
    const onSubmitOrderFailed = vi.fn();
    const wallet = createWallet();
    const params = createParams({
      form,
      client: createClient(form),
      walletInteractions: wallet,
      callbacks: { onSubmitOrderFailed },
    });

    await expect(executeOrder(params)).rejects.toThrow(
      "Input amount must be a non-negative integer base-unit amount",
    );
    expect(wallet.getAllowance).not.toHaveBeenCalled();
    expect(onSubmitOrderFailed).toHaveBeenCalledTimes(1);
    expect(params.getCurrentExecution()).toMatchObject({
      phase: ExecutionPhase.FAILED,
      parsedError: {
        message: "Input amount must be a non-negative integer base-unit amount",
      },
    });
  });

  it("records an API failure after signing even when the failure callback throws", async () => {
    const form = createForm();
    const client = createClient(form);
    vi.mocked(client.submitOrder).mockRejectedValue(new Error("API unavailable"));
    const onSubmitOrderFailed = vi.fn(() => {
      throw new Error("callback failed");
    });
    const params = createParams({
      form,
      client,
      callbacks: { onSubmitOrderFailed },
    });

    await expect(executeOrder(params)).rejects.toThrow("API unavailable");
    expect(client.signOrder).toHaveBeenCalledTimes(1);
    expect(params.getCurrentExecution().phase).toBe(ExecutionPhase.FAILED);
    expect(params.getCurrentExecution().parsedError?.message).toBe(
      "API unavailable",
    );
    expect(onSubmitOrderFailed).toHaveBeenCalledTimes(1);
  });

  it("preserves the original error if the failure transition is stale", async () => {
    const form = createForm();
    const client = createClient(form);
    vi.mocked(client.submitOrder).mockRejectedValue(new Error("API unavailable"));
    const params = createParams({ form, client });
    const replaceExecution = params.replaceExecution;
    params.replaceExecution = (executionId, value) =>
      value.phase === ExecutionPhase.FAILED
        ? false
        : replaceExecution(executionId, value);

    await expect(executeOrder(params)).rejects.toThrow("API unavailable");
  });
});

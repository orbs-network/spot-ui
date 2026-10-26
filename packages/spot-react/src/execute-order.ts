import {
  executeOrder as executeWalletOrder,
  isNativeAddress,
  Module,
  isTxRejected,
  toAmountUI,
  type Address,
  type CalculatedOrderForm,
  type Order,
  type PreparedOrder,
  type SpotClient,
} from "@orbs-network/spot-ui";
import {
  ExecutionPhase,
  Steps,
  type Callbacks,
  type StartedSwapExecution,
  type SwapExecution,
  type Token,
  type WalletInteractions,
} from "./types";
import {
  getReusableCompletedWrap,
  normalizeError,
  observe,
  parseExecutionError,
} from "./execution-state";

interface ExecutionStoreActions {
  getCurrentExecution: () => SwapExecution;
  beginExecution: (
    value: Omit<SwapExecution, "executionId" | "phase">,
  ) => StartedSwapExecution | undefined;
  replaceExecution: (
    executionId: number,
    value: SwapExecution,
  ) => boolean;
}

export interface ExecuteOrderParams extends ExecutionStoreActions {
  account?: Address;
  chainId?: number;
  inputToken?: Token;
  outputToken?: Token;
  wrappedNativeToken?: Token;
  form: CalculatedOrderForm;
  client?: SpotClient;
  walletInteractions: WalletInteractions;
  callbacks?: Callbacks;
  addNewOrder: (order: Order) => void;
  refetchActiveOrders: () => unknown;
  wait?: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
  waitForOrderFill?: (order: Order, executionId: number) => Promise<Order>;
}

const waitFor = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const parseBaseUnitAmount = (value: string, label: string): bigint => {
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `${label} must be a non-negative integer base-unit amount`,
    );
  }
  return BigInt(value);
};

interface ValidatedExecutionInputs {
  account: Address;
  chainId: number;
  inputToken: Token;
  orderInputToken: Token;
  outputToken: Token;
  client: SpotClient;
  inputAmountRaw: string;
}

const validateExecutionInputs = (
  params: ExecuteOrderParams,
): ValidatedExecutionInputs => {
  if (!params.client) throw new Error("Spot client is unavailable");
  if (!params.chainId || !Number.isSafeInteger(params.chainId) || params.chainId <= 0) {
    throw new Error("Spot is unavailable on the connected chain");
  }
  if (!params.account) throw new Error("missing account");
  if (!params.inputToken) throw new Error("missing inputToken");
  if (!params.outputToken) throw new Error("missing outputToken");
  const orderInputToken = isNativeAddress(params.inputToken.address)
    ? params.wrappedNativeToken
    : params.inputToken;
  if (!orderInputToken || isNativeAddress(orderInputToken.address)) {
    throw new Error("missing wrappedNativeToken for native input");
  }
  if (!params.form.canSubmit) {
    throw new Error("Order form is not submittable");
  }

  if (params.form.module === Module.SWAP && !params.waitForOrderFill) {
    throw new Error("Swap settlement tracking is unavailable");
  }
  const inputAmountRaw = params.form.inputAmount.raw;
  parseBaseUnitAmount(inputAmountRaw, "Input amount");
  return {
    account: params.account,
    chainId: params.chainId,
    inputToken: params.inputToken,
    orderInputToken,
    outputToken: params.outputToken,
    client: params.client,
    inputAmountRaw,
  };
};

const trackOrderRequest = ({
  analytics,
  account,
  chainId,
  inputToken,
  outputToken,
  preparedOrder,
}: {
  account: Address;
  chainId: number;
  inputToken: Token;
  outputToken: Token;
  analytics: SpotClient["analytics"];
  preparedOrder: PreparedOrder;
}): void => {
  const { form, values } = preparedOrder;
  observe(() =>
    analytics.onRequestOrder({
      account,
      chainId,
      module: form.module,
      srcToken: inputToken,
      dstToken: outputToken,
      fromTokenAmount: values.inputAmount,
      srcChunkAmount: values.inputAmountPerTrade,
      triggerPricePerTrade: values.triggerOutputAmountPerTrade,
      deadline: values.deadlineMillis,
      fillDelay: values.fillDelayMillis,
      minDstAmountOutPerTrade: values.minOutputAmountPerTrade,
      slippage: form.values.slippageBps / 100,
      isMarketOrder: values.isMarketOrder,
      chunksAmount: values.totalTrades,
    }),
  );
};

export const executeOrder = async (
  params: ExecuteOrderParams,
): Promise<Order | undefined> => {
  const {
    form,
    walletInteractions,
    callbacks,
    addNewOrder,
    refetchActiveOrders,
    getCurrentExecution,
    beginExecution,
    replaceExecution,
    wait = waitFor,
  } = params;
  let inputs: ValidatedExecutionInputs;
  try {
    inputs = validateExecutionInputs(params);
  } catch (error) {
    const normalizedError = normalizeError(error);
    const parsedError = parseExecutionError(error);
    const failedExecution = beginExecution({
      form,
      inputToken: params.inputToken,
      outputToken: params.outputToken,
      chainId: params.chainId,
    });
    if (failedExecution) {
      replaceExecution(failedExecution.executionId, {
        ...failedExecution,
        phase: ExecutionPhase.FAILED,
        error: normalizedError,
        parsedError,
      });
    }
    observe(() =>
      callbacks?.onSubmitOrderFailed?.(parsedError),
    );
    throw normalizedError;
  }
  const {
    account,
    chainId,
    inputToken,
    orderInputToken,
    outputToken,
    client,
    inputAmountRaw,
  } = inputs;
  const { analytics } = client;
  const previousExecution = getCurrentExecution();
  const completedWrap = getReusableCompletedWrap({
    execution: previousExecution,
    account,
    chainId,
    inputTokenAddress: inputToken.address,
    inputAmountRaw,
  });
  const startedExecution = beginExecution({
    form,
    inputToken,
    outputToken,
    chainId,
    completedWrap,
    wrapTxHash: completedWrap?.txHash,
  });
  if (!startedExecution) return undefined;

  const executionId = startedExecution.executionId;
  let execution: SwapExecution = startedExecution;
  const transition = (
    phase: ExecutionPhase,
    changes: Partial<SwapExecution> = {},
  ): void => {
    const nextExecution: SwapExecution = {
      ...execution,
      ...changes,
      executionId,
      phase,
    };
    if (!replaceExecution(executionId, nextExecution)) {
      throw new Error("Execution is no longer current");
    }
    execution = nextExecution;
  };
  const tryTransition = (
    phase: ExecutionPhase,
    changes: Partial<SwapExecution> = {},
  ): boolean => {
    const nextExecution: SwapExecution = {
      ...execution,
      ...changes,
      executionId,
      phase,
    };
    if (!replaceExecution(executionId, nextExecution)) return false;
    execution = nextExecution;
    return true;
  };

  try {
    const { order } = await executeWalletOrder({
      client, account, inputTokenAddress: orderInputToken.address, inputAmountRaw,
      nativeInput: isNativeAddress(inputToken.address), completedWrapTxHash: completedWrap?.txHash,
      walletInteractions, wait, signal: params.signal,
      prepareOrder: () => client.prepareOrder({
        form, inputTokenAddress: orderInputToken.address,
        outputTokenAddress: outputToken.address, swapperAddress: account,
      }),
      validateContext: () => {
        if (getCurrentExecution().executionId !== executionId) throw new Error("Execution is no longer current");
      },
      onUpdate: (update) => {
        const pendingSteps = update.steps.map(step => ({ wrap: Steps.WRAP, approve: Steps.APPROVE, create: Steps.CREATE })[step]);
        const phase = update.phase as ExecutionPhase;
        transition(phase, {
          pendingSteps, totalSteps: pendingSteps.length, stepIndex: update.stepIndex,
          hasApproval: update.hasApproval, wrapTxHash: update.wrapTxHash,
          approveTxHash: update.approvalTxHash,
          ...(update.preparedOrder ? { preparedOrder: update.preparedOrder } : {}),
          ...(update.phase === "wrapping" && update.event === "success" && update.wrapTxHash ? {
            completedWrap: { account, chainId, inputTokenAddress: inputToken.address, inputAmountRaw, txHash: update.wrapTxHash },
          } : {}),
        });
        if (update.phase === "wrapping") {
          if (update.event === "request") observe(callbacks?.onWrapRequest);
          if (update.event === "success" && update.wrapTxHash) observe(() => callbacks?.onWrapSuccess?.({ txHash: update.wrapTxHash!, amount: toAmountUI(inputAmountRaw, orderInputToken.decimals) }));
        }
        if (update.phase === "approving") {
          if (update.event === "request") observe(callbacks?.onApproveRequest);
          if (update.event === "success" && update.approvalTxHash) observe(() => callbacks?.onApproveSuccess?.({ txHash: update.approvalTxHash!, token: orderInputToken, amount: toAmountUI(inputAmountRaw, orderInputToken.decimals) }));
        }
        if (update.phase === "signing") {
          if (update.event === "prepared" && update.preparedOrder) {
            trackOrderRequest({ analytics, account, chainId, inputToken, outputToken, preparedOrder: update.preparedOrder });
            observe(callbacks?.onSignOrderRequest);
          }
          if (update.event === "success" && update.signature) observe(() => callbacks?.onSignOrderSuccess?.(update.signature!));
          if (update.event === "error") observe(() => callbacks?.onSignOrderError?.(normalizeError(update.error)));
        }
      },
    });
    const isSwap = form.module === Module.SWAP;
    transition(isSwap ? ExecutionPhase.SETTLING : ExecutionPhase.SUCCESS, {
      orderId: order.id.toString(),
    });

    observe(() => addNewOrder(order));
    if (!isSwap) observe(() => refetchActiveOrders());
    observe(() => callbacks?.onOrderCreated?.(order));
    if (isSwap) {
      const filledOrder = await params.waitForOrderFill!(order, executionId);
      transition(ExecutionPhase.SUCCESS);
      return filledOrder;
    }
    return order;
  } catch (error) {
    const failedPhase = execution.phase;
    const normalizedError = normalizeError(error);
    const rejected = isTxRejected(error);
    // Error reporting must not hide the original wallet/API error if the
    // execution was concurrently replaced by a host state change.
    tryTransition(
      rejected ? ExecutionPhase.REJECTED : ExecutionPhase.FAILED,
      {
        error: normalizedError,
        parsedError: parseExecutionError(error),
      },
    );

    if (rejected) {
      observe(callbacks?.onSubmitOrderRejected);
    } else if (failedPhase !== ExecutionPhase.SETTLING) {
      observe(() => callbacks?.onSubmitOrderFailed?.(parseExecutionError(error)));
    }
    throw normalizedError;
  }
};

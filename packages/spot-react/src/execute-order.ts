import {
  analytics,
  isNativeAddress,
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

const APPROVAL_CHECK_ATTEMPTS = 3;
const APPROVAL_CHECK_DELAY_MS = 3_000;

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
  isSupportedChain: boolean;
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

const hasAllowance = async ({
  client,
  walletInteractions,
  tokenAddress,
  inputAmountRaw,
}: {
  client: SpotClient;
  walletInteractions: WalletInteractions;
  tokenAddress: string;
  inputAmountRaw: string;
}): Promise<boolean> => {
  const allowance = await walletInteractions.getAllowance({
    tokenAddress,
    spenderAddress: client.spenderAddress,
  });
  // Allowances and order amounts are base-unit integers, so native BigInt is
  // exact here and avoids exposing a decimal-math dependency from spot-react.
  return (
    parseBaseUnitAmount(allowance || "0", "Allowance") >=
    parseBaseUnitAmount(inputAmountRaw, "Input amount")
  );
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
  if (!params.isSupportedChain || !params.chainId) {
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
    const wrapRequired = isNativeAddress(inputToken.address) && !completedWrap;
    const approvalRequired = !(await hasAllowance({
      client,
      walletInteractions,
      tokenAddress: orderInputToken.address,
      inputAmountRaw,
    }));
    const executionSteps: Steps[] = [];
    if (wrapRequired) executionSteps.push(Steps.WRAP);
    if (approvalRequired) executionSteps.push(Steps.APPROVE);
    executionSteps.push(Steps.CREATE);
    let currentStepIndex = 0;

    transition(ExecutionPhase.PREPARING, {
      pendingSteps: executionSteps,
      totalSteps: executionSteps.length,
      stepIndex: currentStepIndex,
      hasApproval: !approvalRequired,
    });
    if (wrapRequired) {
      transition(ExecutionPhase.WRAPPING);
      observe(() => analytics.onWrapRequest());
      observe(callbacks?.onWrapRequest);
      const wrapTxHash = await walletInteractions.wrapNativeToken(
        inputAmountRaw,
      );
      if (!wrapTxHash) throw new Error("failed to wrap input token");
      const nextCompletedWrap = {
        account,
        chainId,
        inputTokenAddress: inputToken.address,
        inputAmountRaw,
        txHash: wrapTxHash,
      };
      currentStepIndex++;
      transition(ExecutionPhase.WRAPPING, {
        wrapTxHash,
        completedWrap: nextCompletedWrap,
        stepIndex: currentStepIndex,
      });
      observe(() => analytics.onWrapSuccess(wrapTxHash));
      observe(() =>
        callbacks?.onWrapSuccess?.({
          txHash: wrapTxHash,
          amount: toAmountUI(inputAmountRaw, orderInputToken.decimals),
        }),
      );
    }

    if (approvalRequired) {
      transition(ExecutionPhase.APPROVING);
      observe(() => analytics.onApproveRequest());
      observe(callbacks?.onApproveRequest);
      const approveTxHash = await walletInteractions.approveToken({
        tokenAddress: orderInputToken.address,
        amount: inputAmountRaw,
        spenderAddress: client.spenderAddress,
      });
      if (!approveTxHash) throw new Error("failed to approve token");
      transition(ExecutionPhase.APPROVING, { approveTxHash });

      let approved = false;
      for (let attempt = 0; attempt < APPROVAL_CHECK_ATTEMPTS; attempt++) {
        approved = await hasAllowance({
          client,
          walletInteractions,
          tokenAddress: orderInputToken.address,
          inputAmountRaw,
        });
        if (approved) break;
        if (attempt < APPROVAL_CHECK_ATTEMPTS - 1) {
          await wait(APPROVAL_CHECK_DELAY_MS);
        }
      }
      if (!approved) {
        throw new Error(
          `Insufficient ${orderInputToken.symbol} allowance to perform the swap. Please approve the token first.`,
        );
      }

      currentStepIndex++;
      transition(ExecutionPhase.APPROVING, {
        hasApproval: true,
        stepIndex: currentStepIndex,
      });
      observe(() => analytics.onApproveSuccess(approveTxHash));
      observe(() =>
        callbacks?.onApproveSuccess?.({
          txHash: approveTxHash,
          token: orderInputToken,
          amount: toAmountUI(inputAmountRaw, orderInputToken.decimals),
        }),
      );
    }

    transition(ExecutionPhase.SIGNING);
    const preparedOrder = client.prepareOrder({
      form,
      inputTokenAddress: orderInputToken.address,
      outputTokenAddress: outputToken.address,
      swapperAddress: account,
    });
    transition(ExecutionPhase.SIGNING, { preparedOrder });
    trackOrderRequest({
      account,
      chainId,
      inputToken,
      outputToken,
      preparedOrder,
    });
    observe(() => analytics.onSignOrderRequest(preparedOrder.order));
    observe(callbacks?.onSignOrderRequest);
    let signature: `0x${string}`;
    try {
      signature = await walletInteractions.signOrder(
        preparedOrder.signingRequest,
      );
      observe(() => analytics.onSignOrderSuccess(signature));
      observe(() => callbacks?.onSignOrderSuccess?.(signature));
    } catch (error) {
      observe(() => analytics.onSignOrderError(error));
      observe(() => callbacks?.onSignOrderError?.(normalizeError(error)));
      throw error;
    }

    transition(ExecutionPhase.SUBMITTING);
    const order = await client.submitOrder(preparedOrder, signature);
    transition(ExecutionPhase.SUCCESS, {
      orderId: order.id.toString(),
    });

    observe(() => addNewOrder(order));
    observe(() => refetchActiveOrders());
    observe(() => callbacks?.onOrderCreated?.(order));
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

    if (failedPhase === ExecutionPhase.WRAPPING) {
      observe(() => analytics.onWrapError(error));
    } else if (failedPhase === ExecutionPhase.APPROVING) {
      observe(() => analytics.onApproveError(error));
    }
    if (rejected) {
      observe(callbacks?.onSubmitOrderRejected);
    } else {
      observe(() => callbacks?.onSubmitOrderFailed?.(parseExecutionError(error)));
    }
    throw normalizedError;
  }
};

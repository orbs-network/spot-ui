import {
  executeOrder as executeWalletOrder,
  isNativeAddress,
  eqIgnoreCase,
  Module,
  SpotError,
  isTxRejected,
  type Address,
  type CalculatedOrderForm,
  type Order,
  type PreparedOrder,
  type SpotClient,
  type Partners,
  type SpotAnalytics,
  type SwapQuote,
} from "@orbs-network/spot-ui";
import {
  ExecutionPhase,
  type Callbacks,
  type StartedSwapExecution,
  type SwapExecution,
  type Token,
  type WalletInteractions,
} from "./types";
import {
  getReusableCompletedWrap,
  isUnconfirmedExecutionError,
  normalizeError,
  observe,
  parseExecutionError,
} from "./execution-state";
import {
  getExecutionProgress,
  notifyExecutionProgress,
  type ExecutionProgressContext,
} from "./execution-progress";
import { createOperationAnalytics, getExecutionAnalyticsContext } from "./analytics";

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
  quote?: SwapQuote;
  client?: SpotClient;
  partner?: Partners;
  disableAnalytics?: boolean;
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
  quote?: SwapQuote;
}

const captureSwapQuote = (
  quote: SwapQuote | undefined,
  inputs: ValidatedExecutionInputs,
  form: CalculatedOrderForm,
): SwapQuote => {
  if (!quote?.request) {
    throw new SpotError("INVALID_QUOTE", "Pass the original swap quote in marketQuote.quote before submitting");
  }
  // Freeze both values and request identity before wrapping or approval can await.
  const reviewedQuote = Object.freeze({ ...quote, request: Object.freeze({ ...quote.request }) });
  const request = reviewedQuote.request;
  const matchesForm = request.chainId === inputs.chainId &&
    request.chainId === inputs.client.chainId &&
    request.partner === inputs.client.partner &&
    eqIgnoreCase(request.inToken, inputs.orderInputToken.address) &&
    eqIgnoreCase(request.outToken, inputs.outputToken.address) &&
    parseBaseUnitAmount(request.inAmount, "Quoted input") === BigInt(inputs.inputAmountRaw) &&
    parseBaseUnitAmount(reviewedQuote.netAmountOut, "Quoted output") === BigInt(form.outputAmount.raw) &&
    parseBaseUnitAmount(reviewedQuote.minimumAmountOut, "Minimum output") === BigInt(form.values.minOutputAmountPerTrade);
  if (!matchesForm) {
    throw new SpotError("QUOTE_CONTEXT_MISMATCH", "Swap quote does not match the reviewed form, tokens, or client");
  }
  return reviewedQuote;
};

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
  // The shared wallet runner validates this spending amount before wallet access.
  const inputs: ValidatedExecutionInputs = {
    account: params.account,
    chainId: params.chainId,
    inputToken: params.inputToken,
    orderInputToken,
    outputToken: params.outputToken,
    client: params.client,
    inputAmountRaw,
  };
  if (params.form.module === Module.SWAP) {
    inputs.quote = captureSwapQuote(params.quote, inputs, params.form);
  }
  return inputs;
};

const prepareExecutionOrder = async (
  { client, orderInputToken, outputToken, account, quote }: ValidatedExecutionInputs,
  form: CalculatedOrderForm,
  signal?: AbortSignal,
  analytics?: SpotAnalytics,
): Promise<PreparedOrder> => {
  if (quote) {
    const { order, signingRequest, approvalRequest, values } = await client.refreshAndPrepareSwap({
      quote,
      account,
      signal,
      analytics,
    });
    // Keep React's review metadata while using the exact payload prepared by the SDK.
    return {
      order,
      signingRequest,
      approvalRequest,
      form,
      values: {
        ...form.values,
        currentTimeMillis: values.currentTimeMillis,
        deadlineMillis: values.deadlineMillis,
      },
    };
  }
  return client.prepareOrder({
    form,
    inputTokenAddress: orderInputToken.address,
    outputTokenAddress: outputToken.address,
    swapperAddress: account,
  });
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
  const analytics = createOperationAnalytics(
    getExecutionAnalyticsContext({ ...params, partner: params.client?.partner ?? params.partner }),
    params.client,
    params.disableAnalytics,
  );
  let inputs: ValidatedExecutionInputs;
  try {
    inputs = validateExecutionInputs(params);
  } catch (error) {
    observe(() => analytics.onExecutionRequest());
    observe(() => analytics.onExecutionError(error, ExecutionPhase.PREPARING));
    const normalizedError = normalizeError(error);
    const parsedError = parseExecutionError(error);
    const failedExecution = beginExecution({
      account: params.account,
      partner: params.client?.partner ?? params.partner,
      apiUrl: params.client?.apiUrl,
      form,
      analytics,
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
    account,
    partner: client.partner,
    apiUrl: client.apiUrl,
    form,
    analytics,
    inputToken,
    outputToken,
    chainId,
    completedWrap,
    wrapTxHash: completedWrap?.txHash,
  });
  if (!startedExecution) return undefined;

  const executionId = startedExecution.executionId;
  let execution: SwapExecution = startedExecution;
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
  const transition = (
    phase: ExecutionPhase,
    changes: Partial<SwapExecution> = {},
  ): void => {
    if (!tryTransition(phase, changes)) {
      throw new Error("Execution is no longer current");
    }
  };
  const progressContext: ExecutionProgressContext = {
    account,
    chainId,
    inputToken,
    orderInputToken,
    inputAmountRaw,
    callbacks,
  };

  try {
    const { order } = await executeWalletOrder({
      client,
      analytics,
      account,
      inputTokenAddress: orderInputToken.address,
      inputAmountRaw,
      nativeInput: isNativeAddress(inputToken.address),
      completedWrapTxHash: completedWrap?.txHash,
      walletInteractions,
      wait,
      signal: params.signal,
      prepareOrder: () => prepareExecutionOrder(inputs, form, params.signal, analytics),
      validateContext: () => {
        if (getCurrentExecution().executionId !== executionId) throw new Error("Execution is no longer current");
      },
      onUpdate: (update) => {
        transition(update.phase as ExecutionPhase, getExecutionProgress(update, progressContext));
        notifyExecutionProgress(update, progressContext);
      },
    });
    const isSwap = form.module === Module.SWAP;
    transition(isSwap ? ExecutionPhase.SETTLING : ExecutionPhase.SUCCESS, {
      orderId: order.id.toString(),
      order,
    });

    observe(() => addNewOrder(order));
    if (!isSwap) observe(() => refetchActiveOrders());
    observe(() => callbacks?.onOrderCreated?.(order));
    if (isSwap) {
      const filledOrder = await params.waitForOrderFill!(order, executionId);
      transition(ExecutionPhase.SUCCESS, { order: filledOrder });
      return filledOrder;
    }
    return order;
  } catch (error) {
    const failedPhase = execution.phase;
    const normalizedError = normalizeError(error);
    // The shared runner checks cancellation after its "submitting" progress event,
    // before starting the POST. That known preflight abort remains safe to retry.
    const abortedBeforeSubmission = failedPhase === ExecutionPhase.SUBMITTING &&
      params.signal?.aborted && error === params.signal.reason;
    const unconfirmed = !abortedBeforeSubmission && isUnconfirmedExecutionError(error, failedPhase);
    const rejected = !unconfirmed && isTxRejected(error);
    // Error reporting must not hide the original wallet/API error if the
    // execution was concurrently replaced by a host state change.
    tryTransition(
      unconfirmed ? ExecutionPhase.UNCONFIRMED : rejected ? ExecutionPhase.REJECTED : ExecutionPhase.FAILED,
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

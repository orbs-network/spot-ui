import {
  OrderSettlementError,
  type Address,
  type CalculatedOrderForm,
  type Order,
  type SpotClient,
  type Partners,
} from "@orbs-network/spot-ui";
import { isNativeAddress, isTxRejected, toAmountUI } from "@orbs-network/spot-ui/internal";
import {
  ExecutionPhase,
  type Callbacks,
  type StartedOrderExecutionState,
  type OrderExecutionState,
  type Token,
  type WalletInteractions,
} from "./types";
import {
  createIdleExecution,
  ExecutionScopeChangedError,
  getMatchingCompletedWrap,
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
import { createOrderWalletAdapter } from "./create-order-wallet-adapter";

interface ExecutionStoreActions {
  getCurrentExecution: () => OrderExecutionState;
  getExecution: (executionId: number) => OrderExecutionState | undefined;
  finishExecution: (executionId: number) => void;
  queueWrapTransaction?: <T>(scope: string, action: () => Promise<T>) => Promise<T>;
  beginExecution: (
    value: Omit<OrderExecutionState, "executionId" | "phase">,
  ) => StartedOrderExecutionState | undefined;
  replaceExecution: (
    executionId: number,
    value: OrderExecutionState,
  ) => boolean;
  subscribeExecution?: (listener: () => void) => () => void;
}

export interface ExecuteOrderParams extends ExecutionStoreActions {
  account?: Address;
  chainId?: number;
  inputToken?: Token;
  outputToken?: Token;
  wrappedNativeToken?: Token;
  form: CalculatedOrderForm;
  client?: SpotClient;
  partner?: Partners;
  walletInteractions: WalletInteractions;
  callbacks?: Callbacks;
  addNewOrder: (order: Order) => void;
  refetchActiveOrders: () => unknown;
  onOrderUpdate?: (order: Order) => void;
  signal?: AbortSignal;
}

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
  return inputs;
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
    queueWrapTransaction,
  } = params;
  const analytics = createOperationAnalytics(
    getExecutionAnalyticsContext({ ...params, partner: params.client?.partner ?? params.partner }),
    params.client,
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
      client: params.client,
      partner: params.client?.partner ?? params.partner,
      apiUrl: params.client?.apiUrl,
      form,
      analytics,
      callbacks,
      inputToken: params.inputToken,
      outputToken: params.outputToken,
      chainId: params.chainId,
      completedWrap: getCurrentExecution().completedWrap,
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
  const completedWrap = getMatchingCompletedWrap({
    execution: previousExecution,
    account,
    chainId,
    inputTokenAddress: inputToken.address,
    wrappedTokenAddress: orderInputToken.address,
    inputAmountRaw,
  });
  const startedExecution = beginExecution({
    account,
    client,
    partner: client.partner,
    apiUrl: client.apiUrl,
    form,
    analytics,
    callbacks,
    inputToken,
    outputToken,
    chainId,
    completedWrap,
    wrapTxHash: completedWrap?.txHash,
  });
  if (!startedExecution) return undefined;

  const executionId = startedExecution.executionId;
  let execution: OrderExecutionState = startedExecution;
  const tryTransition = (
    phase: ExecutionPhase,
    changes: Partial<OrderExecutionState> = {},
  ): boolean => {
    const nextExecution: OrderExecutionState = {
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
    changes: Partial<OrderExecutionState> = {},
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
  let accepted = false;
  const recordAcceptance = (order: Order): void => {
    if (accepted) return;
    accepted = true;
    observe(() => addNewOrder(order));
    observe(() => refetchActiveOrders());
    observe(() => callbacks?.onOrderCreated?.(order));
  };
  const controller = new AbortController();
  const checkScope = () => {
    if (params.signal?.aborted) controller.abort(params.signal.reason);
    else if (!params.getExecution(executionId)) {
      controller.abort(new ExecutionScopeChangedError("Execution is no longer current"));
    }
  };
  params.signal?.addEventListener("abort", checkScope, { once: true });
  const unsubscribe = params.subscribeExecution?.(checkScope);
  checkScope();
  const isScopeDismissal = (error: unknown): boolean => controller.signal.aborted &&
    error === controller.signal.reason && error instanceof ExecutionScopeChangedError;

  try {
    let confirmedWrapAmountRaw: string | undefined;
    let confirmedWrapHash: string | undefined;
    const wallet = createOrderWalletAdapter({
      wallet: walletInteractions,
      guard: () => { checkScope(); controller.signal.throwIfAborted(); },
      hasConfirmedWrap: Boolean(completedWrap),
      queueWrapTransaction: queueWrapTransaction
        ? action => queueWrapTransaction(`${account.toLowerCase()}:${chainId}`, action)
        : undefined,
      onWrapConfirmed: (hash, amountRaw) => {
        confirmedWrapAmountRaw = amountRaw;
        confirmedWrapHash = hash;
        tryTransition(execution.phase, {
          wrapTxHash: hash,
          completedWrap: { account, chainId, inputTokenAddress: inputToken.address, wrappedTokenAddress: orderInputToken.address, inputAmountRaw, txHash: hash },
        });
        observe(() => callbacks?.onWrapSuccess?.({ txHash: hash, amount: toAmountUI(amountRaw, orderInputToken.decimals) }));
      },
      onApproveConfirmed: hash => { tryTransition(execution.phase, { approveTxHash: hash }); },
    });
    const sdkExecution = client.createOrderExecution({
      form,
      account,
      inputTokenAddress: orderInputToken.address,
      outputTokenAddress: outputToken.address,
      walletInteractions: wallet,
      signal: controller.signal,
    });
    transition(execution.phase, { sdkExecution });
    const order = await sdkExecution.run({
      onProgress: (update) => {
        const progress = getExecutionProgress(update, progressContext);
        progress.wrapTxHash ??= execution.wrapTxHash;
        progress.approveTxHash ??= execution.approveTxHash;
        transition(update.phase as ExecutionPhase, progress);
        if (!isScopeDismissal(update.error) &&
          !(update.phase === "wrapping" && update.event === "success" && update.wrapTxHash === confirmedWrapHash)) {
          notifyExecutionProgress(update.phase === "wrapping" && confirmedWrapAmountRaw
            ? { ...update, wrapAmountRaw: confirmedWrapAmountRaw }
            : update, progressContext);
        }
        const order = update.order;
        if (order && update.event === "accepted") recordAcceptance(order);
        if (order && update.event === "updated") {
          observe(() => params.onOrderUpdate?.(order));
        }
      },
    });
    recordAcceptance(order);
    transition(ExecutionPhase.SUCCESS, {
      orderId: order.id.toString(),
      order,
    });
    return order;
  } catch (error) {
    // Advanced execution finishes at acceptance; a later cancellation or
    // adapter error cannot undo the order already accepted by the service.
    const acceptedOrder = execution.order ?? execution.sdkExecution?.order;
    if (acceptedOrder) {
      const order = structuredClone(acceptedOrder) as Order;
      recordAcceptance(order);
      tryTransition(ExecutionPhase.SUCCESS, { orderId: order.id, order, error: undefined, parsedError: undefined });
      return order;
    }
    const settlementOrder = error instanceof OrderSettlementError ? error.order : undefined;
    if (settlementOrder) recordAcceptance(settlementOrder);
    const failedPhase = error instanceof OrderSettlementError ? ExecutionPhase.SETTLING : execution.phase;
    const normalizedError = normalizeError(error);
    // The shared runner checks cancellation after its "submitting" progress event,
    // before starting the POST. That known preflight abort remains safe to retry.
    const abortedBeforeSubmission = failedPhase === ExecutionPhase.SUBMITTING &&
      controller.signal.aborted && error === controller.signal.reason;
    if (isScopeDismissal(error) && failedPhase !== ExecutionPhase.SETTLING &&
      (failedPhase !== ExecutionPhase.SUBMITTING || abortedBeforeSubmission)) {
      const dismissedExecution: OrderExecutionState = {
        ...createIdleExecution(execution.completedWrap),
        executionId,
        wrapTxHash: execution.wrapTxHash,
        approveTxHash: execution.approveTxHash,
      };
      if (replaceExecution(executionId, dismissedExecution)) execution = dismissedExecution;
      return undefined;
    }
    const unconfirmed = !abortedBeforeSubmission && isUnconfirmedExecutionError(error, failedPhase);
    const rejected = !unconfirmed && isTxRejected(error);
    // Error reporting must not hide the original wallet/API error if the
    // execution was concurrently replaced by a host state change.
    tryTransition(
      unconfirmed ? ExecutionPhase.UNCONFIRMED : rejected ? ExecutionPhase.REJECTED : ExecutionPhase.FAILED,
      {
        ...(settlementOrder ? { order: settlementOrder, orderId: settlementOrder.id } : {}),
        error: normalizedError,
        parsedError: parseExecutionError(error),
      },
    );

    if (rejected) {
      observe(callbacks?.onSubmitOrderRejected);
    } else if (!unconfirmed && failedPhase !== ExecutionPhase.SETTLING) {
      observe(() => callbacks?.onSubmitOrderFailed?.(parseExecutionError(error)));
    }
    throw normalizedError;
  } finally {
    unsubscribe?.();
    params.signal?.removeEventListener("abort", checkScope);
    controller.abort();
    params.finishExecution(executionId);
  }
};

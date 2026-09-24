import type { PreparedOrder, SpotClient } from "../client/types";
import { toAmountUI } from "../order-form/amounts";
import type { CalculatedOrderForm } from "../order-form/types";
import type { Order } from "../orders/types";
import { isNativeAddress } from "../shared/addresses";
import { isTxRejected } from "../shared/errors";
import type { Address, Token } from "../shared/types";
import type { ExecutionCallbacks } from "./callbacks";
import {
  createExecutionSnapshot,
  getReusableCompletedWrap,
  normalizeError,
  observe,
  parseExecutionError,
} from "./execution-state";
import {
  ExecutionPhase,
  Steps,
  type ExecutionDetails,
  type StartedSwapExecution,
  type SwapExecution,
} from "./types";
import { type WalletInteractions } from "./wallet";

const APPROVAL_CHECK_ATTEMPTS = 3;
const APPROVAL_CHECK_DELAY_MS = 3_000;

export interface ExecutionController {
  getCurrentExecution: () => SwapExecution;
  beginExecution: (
    value: Omit<SwapExecution, "executionId" | "phase">,
  ) => StartedSwapExecution | undefined;
  replaceExecution: (executionId: number, value: SwapExecution) => boolean;
}

export interface ExecuteOrderParams extends ExecutionController {
  account?: Address;
  chainId?: number;
  hasChainId: boolean;
  inputToken?: Token;
  outputToken?: Token;
  wrappedNativeToken?: Token;
  form: CalculatedOrderForm;
  client?: SpotClient;
  walletInteractions: WalletInteractions;
  callbacks?: ExecutionCallbacks;
  addNewOrder?: (order: Order) => void;
  refetchActiveOrders?: () => unknown;
  wait?: (milliseconds: number) => Promise<void>;
}

/** Runs one submission through validation, funding, signing, and submission. */
export const executeOrder = async (
  request: ExecuteOrderParams,
): Promise<Order | undefined> => {
  const params = { ...request };
  let inputs: ValidatedExecutionInputs;
  try {
    inputs = validateExecutionInputs(params);
  } catch (error) {
    throw recordValidationFailure(params, error);
  }

  // Reuse a wrap for the same account/chain/token when it covers the requested amount.
  const completedWrap = getReusableCompletedWrap({
    execution: params.getCurrentExecution(),
    account: inputs.account,
    chainId: inputs.chainId,
    inputTokenAddress: inputs.inputToken.address,
    inputAmountRaw: inputs.inputAmountRaw,
  });
  const started = params.beginExecution({
    form: params.form,
    inputToken: inputs.inputToken,
    outputToken: inputs.outputToken,
    chainId: inputs.chainId,
    completedWrap,
    wrapTxHash: completedWrap?.txHash,
  });
  // Claim the execution before any asynchronous wallet work to block double submits.
  if (!started) return undefined;

  const context: ExecutionContext = {
    params,
    inputs,
    progress: createExecutionProgress(started, params.replaceExecution),
  };
  try {
    const { wrapRequired, approvalRequired } = await planExecution(context);
    if (wrapRequired) await wrapInput(context);
    if (approvalRequired) await approveInput(context);
    return await signAndSubmitOrder(context);
  } catch (error) {
    throw recordExecutionFailure(context, error);
  }
};

interface ExecutionProgress {
  getSnapshot: () => SwapExecution;
  transition: (
    phase: Exclude<ExecutionPhase, ExecutionPhase.IDLE>,
    changes?: ExecutionDetails,
  ) => void;
  tryTransition: (
    phase: Exclude<ExecutionPhase, ExecutionPhase.IDLE>,
    changes?: ExecutionDetails,
  ) => boolean;
}

interface ExecutionContext {
  params: ExecuteOrderParams;
  inputs: ValidatedExecutionInputs;
  progress: ExecutionProgress;
}

// Keep the last accepted snapshot locally so a stale host write cannot advance a step.
const createExecutionProgress = (
  started: StartedSwapExecution,
  replaceExecution: ExecutionController["replaceExecution"],
): ExecutionProgress => {
  let current: SwapExecution = started;
  const tryTransition: ExecutionProgress["tryTransition"] = (
    phase,
    changes = {},
  ) => {
    const next = createExecutionSnapshot(started.executionId, phase, {
      ...current,
      ...changes,
    });
    if (!replaceExecution(started.executionId, next)) return false;
    current = next;
    return true;
  };
  return {
    getSnapshot: () => current,
    tryTransition,
    transition: (phase, changes) => {
      if (!tryTransition(phase, changes))
        throw new Error("Execution is no longer current");
    },
  };
};

const recordValidationFailure = (
  params: ExecuteOrderParams,
  error: unknown,
): Error => {
  const normalizedError = normalizeError(error);
  const parsedError = parseExecutionError(error);
  const failed = params.beginExecution({
    form: params.form,
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    chainId: params.chainId,
  });
  if (failed) {
    params.replaceExecution(failed.executionId, {
      ...failed,
      phase: ExecutionPhase.FAILED,
      error: normalizedError,
      parsedError,
    });
  }
  observe(() => params.callbacks?.onSubmitOrderFailed?.(parsedError));
  return normalizedError;
};

const planExecution = async ({
  params,
  inputs,
  progress,
}: ExecutionContext): Promise<{
  wrapRequired: boolean;
  approvalRequired: boolean;
}> => {
  const wrapRequired =
    isNativeAddress(inputs.inputToken.address) &&
    !progress.getSnapshot().completedWrap;
  const approvalRequired = !(await hasAllowance({
    client: inputs.client,
    walletInteractions: params.walletInteractions,
    tokenAddress: inputs.orderInputToken.address,
    inputAmountRaw: inputs.inputAmountRaw,
  }));
  const steps: Steps[] = [];
  if (wrapRequired) steps.push(Steps.WRAP);
  if (approvalRequired) steps.push(Steps.APPROVE);
  steps.push(Steps.CREATE);
  progress.transition(ExecutionPhase.PREPARING, {
    pendingSteps: steps,
    totalSteps: steps.length,
    stepIndex: 0,
    hasApproval: !approvalRequired,
  });
  return { wrapRequired, approvalRequired };
};

const wrapInput = async ({
  params,
  inputs,
  progress,
}: ExecutionContext): Promise<void> => {
  const { walletInteractions, callbacks } = params;
  const {
    account,
    chainId,
    inputToken,
    orderInputToken,
    inputAmountRaw,
    client: { analytics },
  } = inputs;
  progress.transition(ExecutionPhase.WRAPPING);
  observe(() => analytics.onWrapRequest());
  observe(callbacks?.onWrapRequest);
  const wrapTxHash = await walletInteractions.wrapNativeToken(inputAmountRaw);
  if (!wrapTxHash) throw new Error("failed to wrap input token");

  // Persist the completed wrap before approval/signing so a retry cannot wrap twice.
  progress.transition(ExecutionPhase.WRAPPING, {
    wrapTxHash,
    completedWrap: {
      account,
      chainId,
      inputTokenAddress: inputToken.address,
      inputAmountRaw,
      txHash: wrapTxHash,
    },
    stepIndex: (progress.getSnapshot().stepIndex ?? 0) + 1,
  });
  observe(() => analytics.onWrapSuccess(wrapTxHash));
  observe(() =>
    callbacks?.onWrapSuccess?.({
      txHash: wrapTxHash,
      amount: toAmountUI(inputAmountRaw, orderInputToken.decimals),
    }),
  );
};

const waitForAllowance = async ({
  params,
  inputs,
}: ExecutionContext): Promise<void> => {
  const wait = params.wait ?? waitFor;
  // Wallet completion may precede the RPC's allowance update; retry reads, not approval transactions.
  for (let attempt = 0; attempt < APPROVAL_CHECK_ATTEMPTS; attempt++) {
    const approved = await hasAllowance({
      client: inputs.client,
      walletInteractions: params.walletInteractions,
      tokenAddress: inputs.orderInputToken.address,
      inputAmountRaw: inputs.inputAmountRaw,
    });
    if (approved) return;
    if (attempt < APPROVAL_CHECK_ATTEMPTS - 1)
      await wait(APPROVAL_CHECK_DELAY_MS);
  }
  throw new Error(
    `Insufficient ${inputs.orderInputToken.symbol} allowance to perform the swap. Please approve the token first.`,
  );
};

const approveInput = async (context: ExecutionContext): Promise<void> => {
  const {
    params: { walletInteractions, callbacks },
    inputs,
    progress,
  } = context;
  const { client, orderInputToken, inputAmountRaw } = inputs;
  const { analytics } = client;
  progress.transition(ExecutionPhase.APPROVING);
  observe(() => analytics.onApproveRequest());
  observe(callbacks?.onApproveRequest);
  const approveTxHash = await walletInteractions.approveToken({
    tokenAddress: orderInputToken.address,
    amount: inputAmountRaw,
    spenderAddress: client.spenderAddress,
  });
  if (!approveTxHash) throw new Error("failed to approve token");
  progress.transition(ExecutionPhase.APPROVING, { approveTxHash });
  await waitForAllowance(context);
  progress.transition(ExecutionPhase.APPROVING, {
    hasApproval: true,
    stepIndex: (progress.getSnapshot().stepIndex ?? 0) + 1,
  });
  observe(() => analytics.onApproveSuccess(approveTxHash));
  observe(() =>
    callbacks?.onApproveSuccess?.({
      txHash: approveTxHash,
      token: orderInputToken,
      amount: toAmountUI(inputAmountRaw, orderInputToken.decimals),
    }),
  );
};

const signOrder = async (
  context: ExecutionContext,
  preparedOrder: PreparedOrder,
): Promise<`0x${string}`> => {
  const { walletInteractions, callbacks } = context.params;
  const { analytics } = context.inputs.client;
  observe(() => analytics.onSignOrderRequest(preparedOrder.order));
  observe(callbacks?.onSignOrderRequest);
  try {
    const signature = await walletInteractions.signOrder(
      preparedOrder.signingRequest,
    );
    observe(() => analytics.onSignOrderSuccess(signature));
    observe(() => callbacks?.onSignOrderSuccess?.(signature));
    return signature;
  } catch (error) {
    observe(() => analytics.onSignOrderError(error));
    observe(() => callbacks?.onSignOrderError?.(normalizeError(error)));
    throw error;
  }
};

const signAndSubmitOrder = async (
  context: ExecutionContext,
): Promise<Order> => {
  const { params, inputs, progress } = context;
  const { client, account, chainId, inputToken, orderInputToken, outputToken } =
    inputs;
  progress.transition(ExecutionPhase.SIGNING);
  // Build only after wrap/approval: the signed deadline and nonce must be fresh.
  const preparedOrder = client.prepareOrder({
    form: params.form,
    inputTokenAddress: orderInputToken.address,
    outputTokenAddress: outputToken.address,
    swapperAddress: account,
  });
  progress.transition(ExecutionPhase.SIGNING, { preparedOrder });
  trackOrderRequest({
    analytics: client.analytics,
    account,
    chainId,
    inputToken,
    outputToken,
    preparedOrder,
  });
  const signature = await signOrder(context, preparedOrder);
  progress.transition(ExecutionPhase.SUBMITTING);
  const order = await client.submitOrder(preparedOrder.order, signature);
  progress.transition(ExecutionPhase.SUCCESS, { orderId: order.id.toString() });

  // History updates and host notifications must never turn a successful order into a failure.
  observe(() => params.addNewOrder?.(order));
  observe(() => params.refetchActiveOrders?.());
  observe(() => params.callbacks?.onOrderCreated?.(order));
  return order;
};

const recordExecutionFailure = (
  context: ExecutionContext,
  error: unknown,
): Error => {
  const { progress } = context;
  const { callbacks } = context.params;
  const { analytics } = context.inputs.client;
  const failedPhase = progress.getSnapshot().phase;
  const normalizedError = normalizeError(error);
  const parsedError = parseExecutionError(error);
  const rejected = isTxRejected(error);
  // A stale failure write must not replace the original wallet/API error with a transition error.
  progress.tryTransition(
    rejected ? ExecutionPhase.REJECTED : ExecutionPhase.FAILED,
    {
      error: normalizedError,
      parsedError,
    },
  );
  if (failedPhase === ExecutionPhase.WRAPPING) {
    observe(() => analytics.onWrapError(error));
  } else if (failedPhase === ExecutionPhase.APPROVING) {
    observe(() => analytics.onApproveError(error));
  }
  if (rejected) observe(callbacks?.onSubmitOrderRejected);
  else observe(() => callbacks?.onSubmitOrderFailed?.(parsedError));
  return normalizedError;
};

const waitFor = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const parseBaseUnitAmount = (value: string, label: string): bigint => {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer base-unit amount`);
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
  // Compare base-unit integers exactly, including amounts above Number.MAX_SAFE_INTEGER.
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
  if (!params.hasChainId || !params.chainId) {
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

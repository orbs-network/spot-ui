import {
  type Address,
  type PreparedOrder,
} from "@orbs-network/spot-ui";
import { toAmountUI, type OrderExecutionStep, type OrderExecutionUpdate } from "@orbs-network/spot-ui/internal";
import { observe, normalizeError } from "./execution-state";
import { Steps, type Callbacks, type SwapExecution, type Token } from "./types";

type ProgressUpdate = OrderExecutionUpdate<PreparedOrder>;

export interface ExecutionProgressContext {
  account: Address;
  chainId: number;
  inputToken: Token;
  orderInputToken: Token;
  inputAmountRaw: string;
  callbacks?: Callbacks;
}

const EXECUTION_STEPS: Record<OrderExecutionStep, Steps> = {
  wrap: Steps.WRAP,
  approve: Steps.APPROVE,
  create: Steps.CREATE,
};

/** Preserve optional snapshots until the runner supplies a replacement. */
export const getExecutionProgress = (
  update: ProgressUpdate,
  context: ExecutionProgressContext,
): Partial<SwapExecution> => {
  const pendingSteps = update.steps.map((step) => EXECUTION_STEPS[step]);
  const completedWrap =
    update.phase === "wrapping" && update.event === "success" && update.wrapTxHash
      ? {
          account: context.account,
          chainId: context.chainId,
          inputTokenAddress: context.inputToken.address,
          inputAmountRaw: context.inputAmountRaw,
          txHash: update.wrapTxHash,
        }
      : undefined;

  return {
    pendingSteps,
    totalSteps: pendingSteps.length,
    stepIndex: update.stepIndex,
    hasApproval: update.hasApproval,
    wrapTxHash: update.wrapTxHash,
    approveTxHash: update.approvalTxHash,
    ...(update.preparedOrder ? { preparedOrder: update.preparedOrder } : {}),
    ...(update.order ? { order: update.order, orderId: update.order.id } : {}),
    ...(completedWrap ? { completedWrap } : {}),
  };
};

const notifyWrapping = (update: ProgressUpdate, context: ExecutionProgressContext): void => {
  const { callbacks, inputAmountRaw, orderInputToken } = context;
  if (update.event === "request") observe(callbacks?.onWrapRequest);
  const txHash = update.wrapTxHash;
  if (update.event === "success" && txHash) {
    observe(() => callbacks?.onWrapSuccess?.({
      txHash,
      amount: toAmountUI(update.wrapAmountRaw ?? inputAmountRaw, orderInputToken.decimals),
    }));
  }
};

const notifyApproval = (update: ProgressUpdate, context: ExecutionProgressContext): void => {
  const { callbacks, inputAmountRaw, orderInputToken } = context;
  if (update.event === "request") observe(callbacks?.onApproveRequest);
  const txHash = update.approvalTxHash;
  if (update.event === "success" && txHash) {
    observe(() => callbacks?.onApproveSuccess?.({
      txHash,
      token: orderInputToken,
      amount: toAmountUI(inputAmountRaw, orderInputToken.decimals),
    }));
  }
};

const notifySigning = (update: ProgressUpdate, context: ExecutionProgressContext): void => {
  const { callbacks } = context;
  if (update.event === "prepared" && update.preparedOrder) {
    observe(callbacks?.onSignOrderRequest);
  }
  const signature = update.signature;
  if (update.event === "success" && signature) {
    observe(() => callbacks?.onSignOrderSuccess?.(signature));
  }
  if (update.event === "error") {
    observe(() => callbacks?.onSignOrderError?.(normalizeError(update.error)));
  }
};

/** Observers run after the execution snapshot commits and cannot change its result. */
export const notifyExecutionProgress = (
  update: ProgressUpdate,
  context: ExecutionProgressContext,
): void => {
  switch (update.phase) {
    case "wrapping":
      notifyWrapping(update, context);
      break;
    case "approving":
      notifyApproval(update, context);
      break;
    case "signing":
      notifySigning(update, context);
      break;
  }
};

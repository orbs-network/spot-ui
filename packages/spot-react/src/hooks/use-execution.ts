import {
  ExecutionPhase,
  ExecutionStatus,
  type ParsedError,
  type Order,
  type Steps,
  type Token,
} from "../types";
import { isNativeAddress, type Address } from "@orbs-network/spot-ui";
import { useMemo, useCallback } from "react";
import { useSubmitOrder } from "./use-submit-order";
import { useSwapExecution } from "./use-swap-execution";
import { useResumeExecution } from "./use-resume-execution";
import { createSpotFormDefaults } from "../context/create-spot-store";
import { useSpotTrading } from "../context/spot-trading-context";
import { useSpotStore } from "../context/spot-store-context";
import { useOrderForm } from "../context/order-form-context";
import { useClient } from "../context/use-client";
import {
  getExecutionStatus,
  getExecutionStep,
  isExecutionActive,
  isExecutionLocked,
} from "../execution-state";

export interface SpotExecutionData {
  phase: ExecutionPhase;
  status?: ExecutionStatus;
  error?: ParsedError;
  currentStep?: Steps;
  currentStepIndex?: number;
  approvalTxHash?: string;
  wrapTxHash?: string;
  totalSteps?: number;
  executionSteps?: Steps[];
  inputToken?: Token;
  outputToken?: Token;
  chainId?: number;
  account?: Address;
  orderId?: string;
  order?: Order;
  submitOrder: () => void;
  /** Checks the saved attempt without signing or submitting a replacement. */
  resumeTracking: () => void;
  startNewOrder: () => boolean;
  returnToOrderForm: () => boolean;
  /** True throughout preparation, wallet steps, submission, and swap settlement. */
  isExecuting: boolean;
  /** For swaps, true only after the order fills; other modules finish on submission. */
  isSuccess: boolean;
  isFailed: boolean;
  isRejected: boolean;
  isUnconfirmed: boolean;
  isPreparingOrder: boolean;
  canDismiss: boolean;
}

export const useExecution = (): SpotExecutionData => {
  const swapExecution = useSwapExecution();
  const {
    inputToken: currentInputToken,
    outputToken: currentOutputToken,
    chainId: currentChainId,
    hasChainId,
    module,
    overrides,
  } = useSpotTrading();
  const { data: client, isLoading: isClientLoading } = useClient();
  const submitOrder = useSubmitOrder();
  const resumeTracking = useResumeExecution();
  const resetOrderState = useSpotStore((state) => state.startNewOrder);
  const submit = useCallback((): void => submitOrder(), [submitOrder]);
  const startNewOrder = useCallback(
    () => resetOrderState(createSpotFormDefaults({ module, overrides })),
    [module, overrides, resetOrderState],
  );
  const status = getExecutionStatus(swapExecution.phase);
  const currentStep = getExecutionStep(swapExecution.phase);
  const isExecuting = isExecutionActive(swapExecution.phase);

  return useMemo(() => {
    return {
      phase: swapExecution.phase,
      status,
      error: swapExecution.parsedError,
      currentStep,
      currentStepIndex: swapExecution.stepIndex,
      approvalTxHash: swapExecution.approveTxHash,
      wrapTxHash: swapExecution.wrapTxHash,
      totalSteps: swapExecution.totalSteps,
      executionSteps: swapExecution.pendingSteps,
      inputToken: swapExecution.inputToken ?? currentInputToken,
      outputToken: swapExecution.outputToken ?? currentOutputToken,
      chainId: swapExecution.chainId ?? currentChainId,
      account: swapExecution.account,
      orderId: swapExecution.orderId,
      order: swapExecution.order,
      submitOrder: submit,
      resumeTracking,
      startNewOrder,
      returnToOrderForm: swapExecution.returnToOrderForm,
      isExecuting,
      isSuccess: swapExecution.phase === ExecutionPhase.SUCCESS,
      isFailed: swapExecution.phase === ExecutionPhase.FAILED,
      isRejected: swapExecution.phase === ExecutionPhase.REJECTED,
      isUnconfirmed: swapExecution.phase === ExecutionPhase.UNCONFIRMED,
      isPreparingOrder:
        swapExecution.phase === ExecutionPhase.PREPARING ||
        (hasChainId && isClientLoading && !client),
      canDismiss: !isExecuting,
    };
  }, [
    client,
    currentStep,
    currentInputToken,
    currentOutputToken,
    currentChainId,
    isClientLoading,
    isExecuting,
    hasChainId,
    startNewOrder,
    submit,
    resumeTracking,
    status,
    swapExecution,
  ]);
};

export const useSubmitButton = () => {
  const {
    inputToken,
    outputToken,
    wrappedNativeToken,
    inputBalanceRaw,
    noLiquidity,
    inputAmountUi,
    marketPriceLoading,
    hasChainId,
  } = useSpotTrading();
  const form = useOrderForm();
  const { data: client, isLoading: isClientLoading } = useClient();
  const executionPhase = useSpotStore(
    (store) => store.state.currentExecution.phase,
  );
  const isExecuting = isExecutionActive(executionPhase);
  const isWrappedNativeTokenMissing = Boolean(
    inputToken &&
      isNativeAddress(inputToken.address) &&
      (!wrappedNativeToken || isNativeAddress(wrappedNativeToken.address)),
  );

  const isPropsLoading =
    marketPriceLoading ||
    (!form.isReady && !form.errors.primary) ||
    inputBalanceRaw === undefined;

  const buttonLoading =
    isExecuting ||
    (hasChainId && isClientLoading && !client) ||
    Boolean(inputToken && outputToken && inputAmountUi && isPropsLoading);
  const disabled = Boolean(
    !form.canSubmit ||
      isExecutionLocked(executionPhase) ||
      !hasChainId ||
      !client ||
      noLiquidity ||
      buttonLoading ||
      !inputToken ||
      !outputToken ||
      isWrappedNativeTokenMissing,
  );

  return useMemo(() => {
    return {
      disabled,
      loading: buttonLoading,
    };
  }, [disabled, buttonLoading]);
};

import {
  ExecutionPhase,
  ExecutionStatus,
  type ParsedError,
  type Steps,
  type Token,
} from "../types";
import { isNativeAddress } from "@orbs-network/spot-ui";
import { useMemo, useCallback } from "react";
import { useSubmitOrder } from "./use-submit-order";
import { useSwapExecution } from "./use-swap-execution";
import { createSpotFormDefaults } from "../context/create-spot-store";
import { useSpotRuntime } from "../context/spot-runtime-context";
import { useSpotStore } from "../context/spot-store-context";
import { useOrderForm } from "../context/order-form-context";
import { useClient } from "../context/use-client";
import {
  getExecutionStatus,
  getExecutionStep,
  isExecutionActive,
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
  submitOrder: () => void;
  startNewOrder: () => boolean;
  returnToOrderForm: () => boolean;
  isExecuting: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  isRejected: boolean;
  isPreparingOrder: boolean;
  canDismiss: boolean;
}

export const useExecution = (): SpotExecutionData => {
  const swapExecution = useSwapExecution();
  const {
    inputToken: currentInputToken,
    outputToken: currentOutputToken,
    chainId: currentChainId,
    isSupportedChain,
    module,
    overrides,
  } = useSpotRuntime();
  const { data: client, isLoading: isClientLoading } = useClient();
  const submitOrder = useSubmitOrder();
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
      submitOrder: submit,
      startNewOrder,
      returnToOrderForm: swapExecution.returnToOrderForm,
      isExecuting,
      isSuccess: swapExecution.phase === ExecutionPhase.SUCCESS,
      isFailed: swapExecution.phase === ExecutionPhase.FAILED,
      isRejected: swapExecution.phase === ExecutionPhase.REJECTED,
      isPreparingOrder:
        swapExecution.phase === ExecutionPhase.PREPARING ||
        (isSupportedChain && isClientLoading && !client),
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
    isSupportedChain,
    startNewOrder,
    submit,
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
    isSupportedChain,
  } = useSpotRuntime();
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
    marketPriceLoading || !form.isReady || inputBalanceRaw === undefined;

  const buttonLoading =
    isExecuting ||
    (isSupportedChain && isClientLoading && !client) ||
    Boolean(inputToken && outputToken && inputAmountUi && isPropsLoading);
  const disabled = Boolean(
    !form.canSubmit ||
      isExecuting ||
      !isSupportedChain ||
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

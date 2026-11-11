import {
  ExecutionPhase,
  ExecutionStatus,
  type ParsedError,
  type Order,
  type Steps,
  type Token,
} from "../types";
import type { Address } from "@orbs-network/spot-ui";
import { useMemo, useCallback } from "react";
import { useSubmitOrder } from "./use-submit-order";
import { useSwapExecution } from "./use-swap-execution";
import { useCheckOrderStatus } from "./use-check-order-status";
import { createSpotFormDefaults } from "../context/create-spot-store";
import { useSpotTrading } from "../context/spot-trading-context";
import { useSpotStore } from "../context/spot-store-context";
import { useOrderForm } from "../context/order-form-context";
import { useClient } from "../context/use-client";
import {
  getExecutionStatus,
  getExecutionStep,
  isExecutionActive,
} from "../execution-state";
import { getSubmitButtonState, type SubmitButtonResult } from "../submit-button-state";

export type { SubmitButtonResult, SubmitDisabledReason } from "../submit-button-state";

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
  /** Checks unresolved foreground and background attempts without submitting again. */
  checkOrderStatus: () => void;
  /** Opens a fresh form while retaining active or unconfirmed attempts for independent recovery; stale callbacks return false. */
  startNewOrder: () => boolean;
  /** Dismisses this execution's failure; stale callbacks return false. */
  returnToOrderForm: () => boolean;
  /** True throughout preparation, wallet steps, submission, and swap settlement. */
  isExecuting: boolean;
  /** For swaps, true only after the order fills; other modules finish on submission. */
  isSuccess: boolean;
  isFailed: boolean;
  isRejected: boolean;
  isUnconfirmed: boolean;
  /** An unresolved submission exists in this form or a detached earlier attempt. */
  hasUnconfirmedExecutions: boolean;
  /** A foreground or background status reconciliation is in progress. */
  isCheckingOrderStatus: boolean;
  isPreparingOrder: boolean;
  canDismiss: boolean;
}

export const useExecution = (): SpotExecutionData => {
  const swapExecution = useSwapExecution();
  const hasUnconfirmedExecutions = useSpotStore(store =>
    store.state.currentExecution.phase === ExecutionPhase.UNCONFIRMED ||
    store.getBackgroundExecutions().some(execution =>
      execution.phase === ExecutionPhase.UNCONFIRMED || execution.phase === ExecutionPhase.SETTLING),
  );
  const isCheckingOrderStatus = useSpotStore(store =>
    store.state.currentExecution.phase === ExecutionPhase.SETTLING ||
    store.getBackgroundExecutions().some(execution => execution.phase === ExecutionPhase.SETTLING),
  );
  const {
    inputToken: currentInputToken,
    outputToken: currentOutputToken,
    chainId: currentChainId,
    hasChainId,
    orderType,
    overrides,
  } = useSpotTrading();
  const { data: client, isLoading: isClientLoading } = useClient();
  const submitOrder = useSubmitOrder();
  const checkOrderStatus = useCheckOrderStatus();
  const resetOrderState = useSpotStore((state) => state.startNewOrder);
  const submit = useCallback((): void => submitOrder(), [submitOrder]);
  const startNewOrder = useCallback(
    () => resetOrderState(createSpotFormDefaults({ orderType, overrides }), swapExecution.executionId),
    [orderType, overrides, resetOrderState, swapExecution.executionId],
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
      checkOrderStatus,
      startNewOrder,
      returnToOrderForm: swapExecution.returnToOrderForm,
      isExecuting,
      isSuccess: swapExecution.phase === ExecutionPhase.SUCCESS,
      isFailed: swapExecution.phase === ExecutionPhase.FAILED,
      isRejected: swapExecution.phase === ExecutionPhase.REJECTED,
      isUnconfirmed: swapExecution.phase === ExecutionPhase.UNCONFIRMED,
      hasUnconfirmedExecutions,
      isCheckingOrderStatus,
      isPreparingOrder:
        swapExecution.phase === ExecutionPhase.PREPARING ||
        (swapExecution.phase === ExecutionPhase.IDLE && hasChainId && isClientLoading && !client),
      canDismiss: true,
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
    checkOrderStatus,
    status,
    swapExecution,
    hasUnconfirmedExecutions,
    isCheckingOrderStatus,
  ]);
};

export const useSubmitButton = (): SubmitButtonResult => {
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
  const { data: client, error: clientError, isLoading: isClientLoading } = useClient();
  const executionPhase = useSpotStore(
    (store) => store.state.currentExecution.phase,
  );
  const result = getSubmitButtonState({
    inputToken,
    outputToken,
    wrappedNativeToken,
    inputBalanceRaw,
    noLiquidity,
    inputAmountUi,
    marketPriceLoading,
    hasChainId,
    form,
    hasClient: Boolean(client),
    clientError,
    isClientLoading,
    executionPhase,
  });

  // Keep the public result stable when unrelated trading inputs change.
  return useMemo(
    () => result,
    [result.disabled, result.loading, result.disabledReason],
  );
};

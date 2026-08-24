import { SwapStatus } from "../types";
import { useMemo, useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useInputErrors } from "./use-input-errors";
import { useSubmitOrderMutation } from "./use-submit-order";
import { useSwapExecution } from "./use-swap-execution";
import BN from "bignumber.js";
import { useSpotStore } from "../store";
import { useRePermitData } from "./use-repermit-data";

export const useSubmitOrderPanel = () => {
  const swapExecution = useSwapExecution();
  const { srcToken, dstToken } = useSpotContext();
  const { isLoading: rePermitLoading } = useRePermitData();
  const submitSwapMutation = useSubmitOrderMutation();
  const resetState = useSpotStore((s) => s.resetState);
  const onSubmitOrder = useCallback(
    () => submitSwapMutation.mutateAsync(),
    [submitSwapMutation],
  );

  const {update, resetSwap,  ...swapExecutionData } = swapExecution;
  

  return useMemo(() => {
    return {
      status: swapExecutionData.status,
      parsedError: swapExecutionData.parsedError,
      error: swapExecutionData.error,
      step: swapExecutionData.step,
      stepIndex: swapExecutionData.stepIndex,
      approveTxHash: swapExecutionData.approveTxHash,
      wrapTxHash: swapExecutionData.wrapTxHash,
      totalSteps: swapExecutionData.totalSteps,
      pendingSteps: swapExecutionData.pendingSteps,
      srcToken,
      dstToken,
      onSubmit: onSubmitOrder,
      resetState,
      resetCurrentSwap: resetSwap,
      isLoading: swapExecution?.status === SwapStatus.LOADING,
      isSuccess: swapExecution?.status === SwapStatus.SUCCESS,
      isFailed: swapExecution?.status === SwapStatus.FAILED,
      confirmButtonLoading:
        swapExecutionData.allowanceLoading || rePermitLoading,
    };
  }, [
    onSubmitOrder,
    swapExecutionData,
    resetState,
    resetSwap,
    srcToken,
    dstToken,
    rePermitLoading,
  ]);
};

export const useSubmitOrderButton = () => {
  const {
    marketPrice,
    srcToken,
    dstToken,
    marketPriceLoading,
    srcBalance,
    srcUsd1Token,
    noLiquidity,
    typedInputAmount,
  } = useSpotContext();
  const {
    error: permitDataError,
    isLoading: permitDataLoading,
    refetch: refetchPermitData,
  } = useRePermitData();

  const isPropsLoading =
    marketPriceLoading ||
    BN(srcUsd1Token || "0").isZero() ||
    srcBalance === undefined ||
    BN(marketPrice || "0").isZero();

  const buttonLoading =
    permitDataLoading ||
    Boolean(srcToken && dstToken && typedInputAmount && isPropsLoading);
  const inputsError = useInputErrors();

  const disabled = Boolean(
    inputsError ||
    permitDataError ||
    noLiquidity ||
    buttonLoading ||
    BN(typedInputAmount || "0").isZero() ||
    !srcToken ||
    !dstToken,
  );

  return useMemo(() => {
    return {
      disabled,
      error: permitDataError,
      loading: buttonLoading,
      retry: refetchPermitData,
    };
  }, [disabled, buttonLoading, permitDataError, refetchPermitData]);
};

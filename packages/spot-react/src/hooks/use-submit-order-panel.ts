import { SwapStatus } from "../types";
import { useMemo, useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useInputErrors } from "./use-input-errors";
import { useSubmitOrderMutation } from "./use-submit-order";
import { useSwapExecution } from "./use-swap-execution";
import BN from "bignumber.js";
import { useSrcAmount } from "./use-src-amount";
import { useDstTokenAmount } from "./use-dst-amount";
import { useSpotStore } from "../store";

export const useSubmitOrderPanel = () => {
  const swapExecution = useSwapExecution();
  const { amountUI: srcAmountUI } = useSrcAmount();
  const { amountUI: dstAmountUI } = useDstTokenAmount();
  const { srcToken, dstToken } = useSpotContext();
  const submitSwapMutation = useSubmitOrderMutation();
  const resetState = useSpotStore((s) => s.resetState);
  const onSubmitOrder = useCallback(
    () => submitSwapMutation.mutateAsync(),
    [submitSwapMutation],
  );

  return useMemo(() => {
    return {
      ...swapExecution,
      srcToken,
      dstToken,
      srcAmount: swapExecution.srcAmount || srcAmountUI,
      dstAmount: swapExecution.dstAmount || dstAmountUI,
      onSubmit: onSubmitOrder,
      resetState,
      isLoading: swapExecution?.status === SwapStatus.LOADING,
      isSuccess: swapExecution?.status === SwapStatus.SUCCESS,
      isFailed: swapExecution?.status === SwapStatus.FAILED,
    };
  }, [onSubmitOrder, swapExecution, srcToken, dstToken, resetState]);
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

  const isPropsLoading =
    marketPriceLoading ||
    BN(srcUsd1Token || "0").isZero() ||
    srcBalance === undefined ||
    BN(marketPrice || "0").isZero();

  const buttonLoading = Boolean(
    srcToken && dstToken && typedInputAmount && isPropsLoading,
  );
  const inputsError = useInputErrors();

  const disabled = Boolean(
    inputsError ||
    noLiquidity ||
    buttonLoading ||
    BN(typedInputAmount || "0").isZero() ||
    !srcToken ||
    !dstToken,
  );

  return useMemo(() => {
    return {
      disabled,
      loading: buttonLoading,
    };
  }, [disabled, buttonLoading]);
};

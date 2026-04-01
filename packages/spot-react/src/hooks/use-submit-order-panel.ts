import { SwapStatus } from "../types";
import { useMemo, useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useInputErrors } from "./use-input-errors";
import { useSubmitOrderMutation } from "./use-submit-order";
import { useSwapExecution } from "./use-swap-execution";
import BN from "bignumber.js";

export const useSubmitOrderPanel = () => {
  const resetSwap = useSpotStore((s) => s.resetState);
  const swapExecution = useSwapExecution();
  const submitSwapMutation = useSubmitOrderMutation();


  const onSubmitOrder = useCallback(
    () => submitSwapMutation.mutateAsync(),
    [submitSwapMutation],
  );

  return useMemo(() => {
    return {
      reset: resetSwap,
      onSubmit: onSubmitOrder,
      ...swapExecution,
      isLoading: swapExecution?.status === SwapStatus.LOADING,
      isSuccess: swapExecution?.status === SwapStatus.SUCCESS,
      isFailed: swapExecution?.status === SwapStatus.FAILED,
    };
  }, [resetSwap, onSubmitOrder, swapExecution]);
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

  const buttonText = useMemo(() => {
    if (noLiquidity) return "noLiquidity";
    if (BN(typedInputAmount || "0").isZero()) return "enterAmount";
    return "placeOrder";
  }, [inputsError, typedInputAmount, noLiquidity]);

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
      text: buttonText,
      loading: buttonLoading,
    };
  }, [disabled, buttonText, buttonLoading]);
};

import { SwapStatus } from "../types";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useInputErrors } from "./use-input-errors";
import { useSrcAmount } from "./use-src-amount";
import { useSubmitOrderMutation } from "./use-submit-order";
import BN from "bignumber.js";

export const useSubmitOrderPanel = () => {
  const { marketPrice, srcToken, dstToken, resetTypedInputAmount } =
    useSpotContext();
  const submitOrderMutation = useSubmitOrderMutation();
  const { amountUI: srcAmountUI } = useSrcAmount();
  const resetSwap = useSpotStore((s) => s.resetState);
  const swapExecution = useSpotStore((s) => s.state.swapExecution);
  const updateSwapExecution = useSpotStore((s) => s.updateSwapExecution);
  const resetSwapExecution = useSpotStore((s) => s.resetSwapExecution);

  const onCloseModal = useCallback(() => {
    if (swapExecution?.status === SwapStatus.SUCCESS) {
      resetTypedInputAmount();
    }
    // Reset execution state when closing unless submit is in progress
    if (swapExecution?.status && swapExecution?.status !== SwapStatus.LOADING) {
      resetSwap();
    }
  }, [swapExecution?.status, resetSwap, resetTypedInputAmount]);

  const onOpenModal = useCallback(() => {
    if (swapExecution?.status !== SwapStatus.LOADING) {
      resetSwapExecution({
        srcToken,
        dstToken,
      });
    }
  }, [resetSwapExecution, srcToken, dstToken, swapExecution?.status]);

  const submitSwapMutation = useMutation({
    mutationFn: async () => {
      updateSwapExecution({
        acceptedSrcAmount: srcAmountUI,
        acceptedMarketPrice: marketPrice,
      });
      const result = await submitOrderMutation.mutateAsync();
      return result;
    },
  });

  const onSubmitOrder = useCallback(
    () => submitSwapMutation.mutateAsync(),
    [submitSwapMutation]
  );

  return useMemo(() => {
    return {
      reset: resetSwap,
      onCloseModal,
      onOpenModal,
      onSubmit: onSubmitOrder,
      ...swapExecution,
      isLoading: swapExecution?.status === SwapStatus.LOADING,
      isSuccess: swapExecution?.status === SwapStatus.SUCCESS,
      isFailed: swapExecution?.status === SwapStatus.FAILED,
    };
  }, [resetSwap, onCloseModal, onSubmitOrder, swapExecution]);
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
    srcToken && dstToken && typedInputAmount && isPropsLoading
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
      !dstToken
  );

  return useMemo(() => {
    return {
      disabled,
      text: buttonText,
      loading: buttonLoading,
    };
  }, [disabled, buttonText, buttonLoading]);
};

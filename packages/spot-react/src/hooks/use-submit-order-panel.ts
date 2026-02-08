import { SwapStatus } from "@orbs-network/swap-ui";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { InputErrors } from "../types";
import { useSpotStore } from "../store";
import { useInputErrors } from "./use-input-errors";
import { useSrcAmount } from "./use-src-amount";
import { useSubmitOrderMutation } from "./use-submit-order";
import { useTranslations } from "./use-translations";
import BN from "bignumber.js";
import { useCurrentOrderTitle } from "./order-hooks";

export const useSubmitOrderPanel = () => {
  const { marketPrice, srcToken, dstToken, resetTypedInputAmount } =
    useSpotContext();
  const submitOrderMutation = useSubmitOrderMutation();
  const updateState = useSpotStore((s) => s.updateState);
  const { amountUI: srcAmountUI } = useSrcAmount();
  const resetSwap = useSpotStore((s) => s.resetState);
  const swapExecution = useSpotStore((s) => s.state.swapExecution);
  const updateSwapExecution = useSpotStore((s) => s.updateSwapExecution);
  const orderTitle = useCurrentOrderTitle();

  const onCloseModal = useCallback(() => {
    if (swapExecution?.status === SwapStatus.SUCCESS) {
      resetTypedInputAmount();
      resetSwap();
    }
  }, [swapExecution?.status, resetSwap, resetTypedInputAmount]);

  const onOpenModal = useCallback(() => {
    if (swapExecution?.status !== SwapStatus.LOADING) {
      updateState({
        acceptedSrcAmount: undefined,
        acceptedMarketPrice: undefined,
      });
      updateSwapExecution({
        srcToken,
        dstToken,
        error: undefined,
        parsedError: undefined,
        status: undefined,
      });
    }
  }, [updateState, srcToken, dstToken]);

  const submitSwapMutation = useMutation({
    mutationFn: async () => {
      updateState({
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
      orderTitle,
      ...swapExecution,
      isLoading: swapExecution?.status === SwapStatus.LOADING,
      isSuccess: swapExecution?.status === SwapStatus.SUCCESS,
      isFailed: swapExecution?.status === SwapStatus.FAILED,
    };
  }, [resetSwap, onCloseModal, onSubmitOrder, swapExecution, orderTitle]);
};

export const useSubmitOrderButton = () => {
  const t = useTranslations();
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
    if (noLiquidity) return t("noLiquidity");
    if (BN(typedInputAmount || "0").isZero()) return t("enterAmount");
    if (inputsError?.type === InputErrors.INSUFFICIENT_BALANCE)
      return t("insufficientFunds");
    return t("placeOrder");
  }, [inputsError, t, typedInputAmount, noLiquidity]);

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

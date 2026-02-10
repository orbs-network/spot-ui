import { useMemo } from "react";
import BN from "bignumber.js";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useSrcAmount } from "./use-src-amount";
import { useTriggerPrice } from "./use-trigger-price";
import { useLimitPrice } from "./use-limit-price";
import { useTrades } from "./use-trades";
import { useFillDelay } from "./use-fill-delay";
import { useDuration } from "./use-duration";
import { useTranslations } from "./use-translations";
import { getErrors, InputErrors } from "@orbs-network/spot-ui";

export function useInputErrors() {
  const {
    marketPrice,
    marketPriceLoading,
    typedInputAmount,
    srcUsd1Token,
    srcBalance,
    chainId,
  } = useSpotContext();
  const status = useSpotStore((s) => s.state.swapExecution.status);
  const t = useTranslations();

  const { error: triggerPriceError } = useTriggerPrice();
  const { error: limitPriceError } = useLimitPrice();
  const { error: tradesError } = useTrades();
  const { error: fillDelayError } = useFillDelay();
  const { error: durationError } = useDuration();
  const srcAmountWei = useSrcAmount().amountWei;

  const balanceError = useMemo(() => {
    if (srcBalance && BN(srcAmountWei).gt(srcBalance)) {
      return {
        type: InputErrors.INSUFFICIENT_BALANCE,
        message: t("insufficientFunds"),
        value: srcBalance || "",
      };
    }
  }, [srcBalance, srcAmountWei, t, chainId]);

  return useMemo(() => {
    return getErrors({
      marketPrice,
      typedInputAmount,
      srcUsd1Token,
      marketPriceLoading,
      triggerPriceError,
      limitPriceError,
      tradesError,
      fillDelayError,
      durationError,
      balanceError,
    });
  }, [
    marketPrice,
    marketPriceLoading,
    typedInputAmount,
    triggerPriceError,
    limitPriceError,
    tradesError,
    fillDelayError,
    durationError,
    balanceError,
    status,
    srcUsd1Token,
  ]);
}

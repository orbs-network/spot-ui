import { useMemo } from "react";
import BN from "bignumber.js";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { InputError, InputErrors, SwapStatus } from "../types";
import { useSrcAmount } from "./use-src-amount";
import { useTriggerPrice } from "./use-trigger-price";
import { useLimitPrice } from "./use-limit-price";
import { useTrades } from "./use-trades";
import { useFillDelay } from "./use-fill-delay";
import { useDuration } from "./use-duration";
import { useTranslations } from "./use-translations";
import { getQueryParam } from "@orbs-network/spot-ui";

export const useBalanceError = () => {
  const { srcBalance, chainId } = useSpotContext();
  const t = useTranslations();
  const srcAmountWei = useSrcAmount().amountWei;

  return useMemo((): InputError | undefined => {
    if (srcBalance && BN(srcAmountWei).gt(srcBalance)) {
      return {
        type: InputErrors.INSUFFICIENT_BALANCE,
        message: t("insufficientFunds"),
        value: srcBalance || "",
      };
    }
  }, [srcBalance, srcAmountWei, t, chainId]);
};

export function useInputErrors() {
  const { marketPrice, marketPriceLoading, typedInputAmount } = useSpotContext();
  const status = useSpotStore((s) => s.state.swapExecution.status);
  const balanceError = useBalanceError();
  const { error: triggerPriceError } = useTriggerPrice();
  const { error: limitPriceError } = useLimitPrice();
  const { error: tradesError } = useTrades();
  const { error: fillDelayError } = useFillDelay();
  const { error: durationError } = useDuration();

  return useMemo(() => {
    const ignoreErrors = getQueryParam("ignore-errors");
    if (status === SwapStatus.LOADING) {
      return undefined;
    }
    if (
      BN(marketPrice || 0).isZero() ||
      BN(typedInputAmount || 0).isZero() ||
      marketPriceLoading ||
      ignoreErrors
    ) {
      return undefined;
    }

    return (
      triggerPriceError ||
      limitPriceError ||
      tradesError ||
      fillDelayError ||
      durationError ||
      balanceError
    );
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
  ]);
}

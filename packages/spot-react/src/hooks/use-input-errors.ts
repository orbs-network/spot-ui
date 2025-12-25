import { useMemo } from "react";
import BN from "bignumber.js";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { InputError, InputErrors } from "../types";
import { useSrcAmount } from "./use-src-amount";
import { useTriggerPrice } from "./use-trigger-price";
import { useLimitPrice } from "./use-limit-price";
import { useTrades } from "./use-trades";
import { useFillDelay } from "./use-fill-delay";
import { useDuration } from "./use-duration";
import { useTranslations } from "./use-translations";
import { getQueryParam } from "@orbs-network/spot-ui";

export const useBalanceError = () => {
  const { srcBalance } = useSpotContext();
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
  }, [srcBalance, srcAmountWei, t]);
};

export function useInputErrors() {
  const { marketPrice, marketPriceLoading } = useSpotContext();
  const srcAmount = useSpotStore((s) => s.state.typedSrcAmount);
  const balanceError = useBalanceError();
  const { error: triggerPriceError } = useTriggerPrice();
  const { error: limitPriceError } = useLimitPrice();
  const { error: tradesError } = useTrades();
  const { error: fillDelayError } = useFillDelay();
  const { error: durationError } = useDuration();

  const ignoreErrors = useMemo(() => getQueryParam("ignore-errors"), []);

  if (BN(marketPrice || 0).isZero() || BN(srcAmount || 0).isZero() || marketPriceLoading || ignoreErrors) {
    return undefined;
  }

  return triggerPriceError || limitPriceError || tradesError || fillDelayError || durationError || balanceError;
}

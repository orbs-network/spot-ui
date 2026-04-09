import { useMemo } from "react";
import BN from "bignumber.js";
import { useSpotContext } from "../spot-context";
import { useSrcAmount } from "./use-src-amount";
import { useTriggerPrice } from "./use-trigger-price";
import { useLimitPrice } from "./use-limit-price";
import { useTrades } from "./use-trades";
import { useFillDelay } from "./use-fill-delay";
import { useDuration } from "./use-duration";
import { getErrors, InputErrors } from "@orbs-network/spot-ui";
import { useUsdAmount } from "./helper-hooks";

const useMinTradeSizeError = () => {
  const { minChunkSizeUsd, typedInputAmount, srcUsd1Token } = useSpotContext();
  const typedInputAmountUsd = useUsdAmount(typedInputAmount, srcUsd1Token)
  return useMemo(() => {

    return BN(minChunkSizeUsd).gt(BN(typedInputAmountUsd || "0")) ? {
      type: InputErrors.MIN_TRADE_SIZE_ERROR,
      value: minChunkSizeUsd,
    } : undefined;
  }, [minChunkSizeUsd, typedInputAmountUsd]);
};

export function useInputErrors() {
  const {
    marketPrice,
    marketPriceLoading,
    typedInputAmount,
    srcUsd1Token,
    srcBalance,
    chainId,
  } = useSpotContext();

  const { error: triggerPriceError } = useTriggerPrice();
  const { error: limitPriceError } = useLimitPrice();
  const { error: tradesError } = useTrades();
  const { error: fillDelayError } = useFillDelay();
  const { error: durationError } = useDuration();
  const minTradeSizeError = useMinTradeSizeError();
  const srcAmountWei = useSrcAmount().amount;

  const balanceError = useMemo(() => {
    if (srcBalance && BN(srcAmountWei).gt(srcBalance)) {
      return {
        type: InputErrors.INSUFFICIENT_BALANCE,
        value: srcBalance || "",
      };
    }
  }, [srcBalance, srcAmountWei, chainId]);

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
      minTradeSizeError,
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
    srcUsd1Token,
    minTradeSizeError,
  ]);
}

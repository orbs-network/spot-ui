import { useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useDefaultLimitPricePercent } from "./use-default-values";
import { usePricePanel } from "./use-price-panel";
import { useLimitPrice, useLimitPriceToggle } from "./use-limit-price";

export const useLimitPricePanel = () => {
    const { module, marketPriceLoading, srcToken, dstToken } = useSpotContext();
    const { amount, amountUI, onChange, onPercentageChange, usd, selectedPercentage, error, isTypedValue } = useLimitPrice();
    const updateState = useSpotStore((s) => s.updateState);
    const defaultLimitPricePercent = useDefaultLimitPricePercent();
    const { isLimitPrice, toggleLimitPrice } = useLimitPriceToggle();
    const { fromToken, toToken } = usePricePanel();

    const reset = useCallback(() => {
      updateState({ typedLimitPrice: undefined });
      updateState({ limitPricePercent: defaultLimitPricePercent });
    }, [updateState, module, defaultLimitPricePercent]);

    return {
      price: amount,
      priceUI: amountUI,
      error,
      onInputChange: onChange,
      onPercentageChange,
      onReset: reset,
      usd,
      srcToken,
      dstToken,
      invertedSrcToken: fromToken,
      invertedDstToken: toToken,
      percentage: selectedPercentage,
      isLoading: marketPriceLoading,
      isLimitPrice,
      toggleLimitPrice,
      isTypedValue,
    };
  };

import { useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useDefaultLimitPricePercent } from "./use-default-values";
import { usePricePanel, usePricePanelAmount } from "./use-price-panel";
import { useLimitPrice, useLimitPriceToggle } from "./use-limit-price";

export const useLimitPricePanel = () => {
    const { module, marketPriceLoading, srcToken, dstToken, srcUsd1Token, dstUsd1Token } = useSpotContext();
    const { amount, typedValue, onChange, onPercentageChange, selectedPercentage, error, isTypedValue } = useLimitPrice();
    const updateState = useSpotStore((s) => s.updateState);
    const defaultLimitPricePercent = useDefaultLimitPricePercent();
    const { isLimitPrice, toggleLimitPrice } = useLimitPriceToggle();
    const { fromToken, toToken, isInverted } = usePricePanel();
    const price = usePricePanelAmount({
      amount,
      typedValue,
      amountDecimals: dstToken?.decimals || 18,
      invertedAmountDecimals: srcToken?.decimals || 18,
      amountUsd: dstUsd1Token,
      invertedAmountUsd: srcUsd1Token,
      isInverted,
    });

    const reset = useCallback(() => {
      updateState({ typedLimitPrice: undefined });
      updateState({ limitPricePercent: defaultLimitPricePercent });
    }, [updateState, module, defaultLimitPricePercent]);

    return {
      price: price.amount,
      priceUI: price.amountUI,
      error,
      onInputChange: onChange,
      onPercentageChange,
      onReset: reset,
      usd: price.usd,
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

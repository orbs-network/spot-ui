import { useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useDefaultLimitPricePercent } from "./use-default-values";
import { useDstMinAmountPerTrade } from "./use-dst-amount";
import { useInvertTradePanel } from "./use-invert-trade-panel";
import { useLimitPrice, useLimitPriceToggle } from "./use-limit-price";
import { useTrades } from "./use-trades";

export const useLimitPricePanel = () => {
    const { module, marketPriceLoading } = useSpotContext();
    const { amountUI, onChange, onPercentageChange, usd, selectedPercentage, error, isTypedValue } = useLimitPrice();
  const { amountUI: amountPerChunkUI, usd: amountPerChunkUsd } = useDstMinAmountPerTrade();
    const updateState = useSpotStore((s) => s.updateState);
    const defaultLimitPricePercent = useDefaultLimitPricePercent();
    const { isLimitPrice, toggleLimitPrice } = useLimitPriceToggle();
    const { isInverted, onInvert, fromToken, toToken } = useInvertTradePanel();
  
  
    const reset = useCallback(() => {
      updateState({ typedLimitPrice: undefined });
      updateState({ limitPricePercent: defaultLimitPricePercent });
    }, [updateState, module, defaultLimitPricePercent]);
  
    return {
      price: amountUI,
      amountPerChunk: amountPerChunkUI,
      amountPerChunkUsd: amountPerChunkUsd,
      error,
      onChange,
      onPercentageChange,
      onReset: reset,
      usd,
      fromToken,
      tradesAmount: useTrades().totalTrades,
      toToken,
      percentage: selectedPercentage,
      isInverted,
      isLoading: marketPriceLoading,
      isLimitPrice,
      toggleLimitPrice,
      onInvert,
      isTypedValue,
    };
  };
  
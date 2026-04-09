import { useCallback, useMemo } from "react";
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
  
    const tradesAmount = useTrades().totalTrades;

    return useMemo(() => ({
      price: amountUI,
      amountPerChunk: amountPerChunkUI,
      amountPerChunkUsd,
      error,
      onChange,
      onPercentageChange,
      onReset: reset,
      usd,
      fromToken,
      tradesAmount,
      toToken,
      percentage: selectedPercentage,
      isInverted,
      isLoading: marketPriceLoading,
      isLimitPrice,
      toggleLimitPrice,
      onInvert,
      isTypedValue,
    }), [amountUI, amountPerChunkUI, amountPerChunkUsd, error, onChange, onPercentageChange, reset, usd, fromToken, tradesAmount, toToken, selectedPercentage, isInverted, marketPriceLoading, isLimitPrice, toggleLimitPrice, onInvert, isTypedValue]);
  };
  
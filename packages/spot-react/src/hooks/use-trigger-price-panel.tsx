import { Module } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useInvertTradePanel } from "./use-invert-trade-panel";
import { useTriggerPrice } from "./use-trigger-price";
import { useTrades } from "./use-trades";

export const useTriggerPricePanel = () => {
    const { module, marketPrice, marketPriceLoading } = useSpotContext();
    const { amountUI, onChange, onPercentageChange, usd, selectedPercentage, error, pricePerChunkUI, pricePerChunkUsd: amountPerChunkUsd, isTypedValue } = useTriggerPrice();
    const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
    const updateState = useSpotStore((s) => s.updateState);
    const { isInverted, onInvert, fromToken, toToken } = useInvertTradePanel();
  
    const onSetDefault = useCallback(() => {
      updateState({ triggerPricePercent: undefined, typedTriggerPrice: undefined });
    }, [updateState]);
  
    const hide = module !== Module.STOP_LOSS && module !== Module.TAKE_PROFIT;
    const totalTrades = useTrades().totalTrades;
    const isLoading = marketPriceLoading || !marketPrice;

    return useMemo(() => ({
      price: amountUI,
      amountPerChunk: pricePerChunkUI,
      amountPerChunkUsd,
      error,
      onChange,
      onPercentageChange,
      percentage: selectedPercentage,
      isActive: !isMarketOrder,
      onReset: onSetDefault,
      usd,
      fromToken,
      toToken,
      prefix: "",
      isLoading,
      isInverted,
      hide,
      onInvert,
      totalTrades,
      isTypedValue,
    }), [amountUI, pricePerChunkUI, amountPerChunkUsd, error, onChange, onPercentageChange, selectedPercentage, isMarketOrder, onSetDefault, usd, fromToken, toToken, isLoading, isInverted, hide, onInvert, totalTrades, isTypedValue]);
  };
  
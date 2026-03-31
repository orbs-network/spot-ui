import { Module } from "@orbs-network/spot-ui";
import { useCallback } from "react";
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
  
    return {
      price: amountUI,
      amountPerChunk: pricePerChunkUI,
      amountPerChunkUsd: amountPerChunkUsd,
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
      isLoading: marketPriceLoading || !marketPrice,
      isInverted,
      hide,
      onInvert,
      totalTrades: useTrades().totalTrades,
      isTypedValue,
    };
  };
  
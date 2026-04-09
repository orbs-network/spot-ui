import { useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { usePricePanel } from "./use-price-panel";
import { useTriggerPrice } from "./use-trigger-price";

export const useTriggerPricePanel = () => {
    const { marketPrice, marketPriceLoading, srcToken, dstToken } = useSpotContext();
    const { amount, amountUI, onChange, onPercentageChange, usd, selectedPercentage, error, pricePerChunk: amountPerChunkWei, pricePerChunkUI, pricePerChunkUsd: amountPerChunkUsd, isTypedValue } = useTriggerPrice();
    const updateState = useSpotStore((s) => s.updateState);
    const { fromToken, toToken } = usePricePanel();

    const onSetDefault = useCallback(() => {
      updateState({ triggerPricePercent: undefined, typedTriggerPrice: undefined });
    }, [updateState]);


    return {
      price: amount,
      priceUI: amountUI,
      amountPerChunk: amountPerChunkWei,
      amountPerChunkUI: pricePerChunkUI,
      amountPerChunkUsd,
      error,
      onInputChange: onChange,
      onPercentageChange,
      percentage: selectedPercentage,
      onReset: onSetDefault,
      usd,
      srcToken,
      dstToken,
      invertedSrcToken: fromToken,
      invertedDstToken: toToken,
      isLoading: marketPriceLoading || !marketPrice,
      isTypedValue,
    };
  };

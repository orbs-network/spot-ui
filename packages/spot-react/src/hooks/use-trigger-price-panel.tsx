import { useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { usePricePanel, usePricePanelAmount } from "./use-price-panel";
import { useTriggerPrice } from "./use-trigger-price";

export const useTriggerPricePanel = () => {
    const { marketPrice, marketPriceLoading, srcToken, dstToken, srcUsd1Token, dstUsd1Token } = useSpotContext();
    const { amount, typedValue, onChange, onPercentageChange, selectedPercentage, error, pricePerChunk: amountPerChunkWei, pricePerChunkUI, pricePerChunkUsd: amountPerChunkUsd, isTypedValue } = useTriggerPrice();
    const updateState = useSpotStore((s) => s.updateState);
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

    const onSetDefault = useCallback(() => {
      updateState({ triggerPricePercent: undefined, typedTriggerPrice: undefined });
    }, [updateState]);


    return {
      price: price.amount,
      priceUI: price.amountUI,
      amountPerChunk: amountPerChunkWei,
      amountPerChunkUI: pricePerChunkUI,
      amountPerChunkUsd,
      error,
      onInputChange: onChange,
      onPercentageChange,
      percentage: selectedPercentage,
      onReset: onSetDefault,
      usd: price.usd,
      srcToken,
      dstToken,
      invertedSrcToken: fromToken,
      invertedDstToken: toToken,
      isLoading: marketPriceLoading || !marketPrice,
      isTypedValue,
    };
  };

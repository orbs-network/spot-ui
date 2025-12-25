import { useCallback } from "react";
import { useSpotStore } from "../store";
import BN from "bignumber.js";
import { useSpotContext } from "../spot-context";

export const useInvertTradePanel = () => {
  const { srcToken, dstToken, marketPriceLoading } = useSpotContext();
  const updateState = useSpotStore((s) => s.updateState);
  const isInverted = useSpotStore((s) => s.state.isInvertedTrade);
  const typedTriggerPrice = useSpotStore((s) => s.state.typedTriggerPrice);
  const typedLimitPrice = useSpotStore((s) => s.state.typedLimitPrice);
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const onInvert = useCallback(() => {
    if (marketPriceLoading) return;
    if (typedTriggerPrice !== undefined) {
      updateState({ typedTriggerPrice: BN(1).div(typedTriggerPrice).toFixed() });
    }
    if (typedLimitPrice !== undefined) {
      updateState({ typedLimitPrice: BN(1).div(typedLimitPrice).toFixed() });
    }
    updateState({ isInvertedTrade: !isInverted });
  }, [updateState, isInverted, typedTriggerPrice, typedLimitPrice, marketPriceLoading]);

  return {
    onInvert,
    isInverted,
    fromToken: isInverted ? dstToken : srcToken,
    toToken: isInverted ? srcToken : dstToken,
    isMarketPrice: isMarketOrder,
  };
};

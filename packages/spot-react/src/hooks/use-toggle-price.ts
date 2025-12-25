import { useCallback } from "react";
import { useSpotStore } from "../store";

export const useTogglePricePanel = () => {
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const updateState = useSpotStore((s) => s.updateState);
  const togglePrice = useCallback(() => {
    updateState({ isMarketOrder: !isMarketOrder });
  }, [updateState, isMarketOrder]);
  return {
    isMarketPrice: !isMarketOrder,
    togglePrice,
  };
};

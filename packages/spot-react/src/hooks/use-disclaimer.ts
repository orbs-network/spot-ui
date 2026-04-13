import { Module } from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { Disclaimer } from "../types";

export const useDisclaimer = (): Disclaimer | undefined => {
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const { module } = useSpotContext();

  const triggerPriceWarning = useMemo(() => {
    if(!isMarketOrder) return;
    if (module !== Module.STOP_LOSS) return;

    return Disclaimer.TRIGGER_MARKET_PRICE
  }, [isMarketOrder, module]);

  const spotWarning = useMemo(() => {
    if (module !== Module.LIMIT && module !== Module.TWAP) return;
    return isMarketOrder ? Disclaimer.MARKET_PRICE : Disclaimer.LIMIT_PRICE
  }, [isMarketOrder, module]);
  return triggerPriceWarning || spotWarning;
};

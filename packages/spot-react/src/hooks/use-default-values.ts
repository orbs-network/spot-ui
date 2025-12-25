import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import {
  DEFAULT_STOP_LOSS_LIMIT_PERCENTAGE,
  DEFAULT_STOP_LOSS_PERCENTAGE,
  DEFAULT_TAKE_PROFIT_LIMIT_PERCENTAGE,
  DEFAULT_TAKE_PROFIT_PERCENTAGE,
  Module,
} from "@orbs-network/spot-ui";
import { useSpotStore } from "../store";

export const useDefaultTriggerPricePercent = () => {
  const { module } = useSpotContext();
  return useMemo(() => {
    return module === Module.STOP_LOSS ? DEFAULT_STOP_LOSS_PERCENTAGE : DEFAULT_TAKE_PROFIT_PERCENTAGE;
  }, [module]);
};

export const useDefaultLimitPricePercent = () => {
  const { module } = useSpotContext();
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  return useMemo(() => {
    if ((module !== Module.STOP_LOSS && module !== Module.TAKE_PROFIT) || isMarketOrder) {
      return undefined;
    }
    const result = module === Module.STOP_LOSS ? DEFAULT_STOP_LOSS_LIMIT_PERCENTAGE : DEFAULT_TAKE_PROFIT_LIMIT_PERCENTAGE;
    return result;
  }, [module, isMarketOrder]);
};

import { Module } from "@orbs-network/spot-ui";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useLimitPrice } from "./use-limit-price";
import { useTriggerPrice } from "./use-trigger-price";

export const useTradePrice = () => {
  const { module, marketPrice } = useSpotContext();
  const limitPrice = useLimitPrice().amountWei;
  const triggerPrice = useTriggerPrice().amountWei;
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);

  if (module === Module.LIMIT || !isMarketOrder) {
    return limitPrice || "";
  }

  if (module === Module.STOP_LOSS || module === Module.TAKE_PROFIT) {
    return triggerPrice || "";
  }

  return marketPrice || "";
};

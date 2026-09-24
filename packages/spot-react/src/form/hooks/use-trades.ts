import { observe } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useSpotTrading } from "../../provider/trading-context";
import { useSpotStore } from "../../store/store-context";
import { useOrderForm } from "../form-context";

export const useTrades = () => {
  const { inputToken, outputToken, callbacks } = useSpotTrading();
  const updateState = useSpotStore((state) => state.updateState);
  const { trades } = useOrderForm();

  const onChange = useCallback(
    (trades: number) => {
      updateState({ tradeCount: trades });
      observe(() => callbacks?.onTradeCountChange?.(trades));
    },
    [callbacks, updateState],
  );

  return useMemo(
    () => ({
      totalTrades: trades.totalTrades,
      maxTrades: trades.maxTrades,
      inputAmountPerTrade: trades.inputAmountPerTrade,
      minOutputAmountPerTrade: trades.minOutputAmountPerTrade,
      triggerOutputAmountPerTrade: trades.triggerOutputAmountPerTrade,
      onChange,
      error: trades.error,
      inputToken,
      outputToken,
    }),
    [inputToken, onChange, outputToken, trades],
  );
};

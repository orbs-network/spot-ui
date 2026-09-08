import { useCallback, useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotRuntime } from "../context/spot-runtime-context";
import { useSpotStore } from "../context/spot-store-context";
import { observe } from "../execution-state";

export const useTrades = () => {
  const { inputToken, outputToken, callbacks } = useSpotRuntime();
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

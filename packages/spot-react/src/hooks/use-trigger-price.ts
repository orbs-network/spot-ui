import { useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotTrading } from "../context/spot-trading-context";
import { useSpotStore } from "../context/spot-store-context";
import { usePriceInput } from "./use-price-input";

export const useTriggerPrice = () => {
  const { marketPriceLoading, inputToken, outputToken, callbacks } =
    useSpotTrading();
  const { marketPrice, trades, triggerPrice, isInverted } = useOrderForm();
  const updateState = useSpotStore((state) => state.updateState);

  const { onInputChange, onPercentageChange, onReset } =
    usePriceInput("trigger", updateState, callbacks);

  return useMemo(
    () => ({
      price: triggerPrice.display,
      canonicalPriceRaw: triggerPrice.raw,
      outputAmountPerTrade: trades.triggerOutputAmountPerTrade,
      error: triggerPrice.error,
      onInputChange,
      onPercentageChange,
      percentage: triggerPrice.percentage,
      onReset,
      inputToken,
      outputToken,
      displayInputToken: isInverted ? outputToken : inputToken,
      displayOutputToken: isInverted ? inputToken : outputToken,
      isLoading: Boolean(marketPriceLoading || !marketPrice.raw),
      isTypedValue: triggerPrice.isTypedValue,
    }),
    [
      inputToken,
      isInverted,
      marketPrice.raw,
      marketPriceLoading,
      onInputChange,
      onPercentageChange,
      onReset,
      outputToken,
      trades.triggerOutputAmountPerTrade,
      triggerPrice,
    ],
  );
};

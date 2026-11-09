import { Module } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotTrading } from "../context/spot-trading-context";
import { useSpotStore } from "../context/spot-store-context";
import { usePriceInput } from "./use-price-input";

export const useLimitPrice = () => {
  const { marketPriceLoading, inputToken, outputToken, callbacks } =
    useSpotTrading();
  const { limitPrice, values, module, isInverted } = useOrderForm();
  const updateState = useSpotStore((state) => state.updateState);

  const { onInputChange, onPercentageChange, onReset } =
    usePriceInput("limit", updateState, callbacks);

  const isEnabled = !values.isMarketOrder;
  const toggle = useCallback(() => {
    // Keep typed trigger and limit prices in their current units.
    updateState({
      isMarketOrder: !values.isMarketOrder,
      ...(!values.isMarketOrder && module === Module.STOP_LOSS
        ? { limitPricePercent: undefined }
        : {}),
    });
  }, [module, updateState, values.isMarketOrder]);

  return useMemo(
    () => ({
      price: limitPrice.display,
      canonicalPriceRaw: limitPrice.raw,
      error: limitPrice.error,
      onInputChange,
      onPercentageChange,
      onReset,
      inputToken,
      outputToken,
      displayInputToken: isInverted ? outputToken : inputToken,
      displayOutputToken: isInverted ? inputToken : outputToken,
      percentage: limitPrice.percentage,
      isLoading: Boolean(marketPriceLoading),
      isEnabled,
      toggle,
      isTypedValue: limitPrice.isTypedValue,
    }),
    [
      inputToken,
      isInverted,
      isEnabled,
      limitPrice,
      marketPriceLoading,
      onInputChange,
      onPercentageChange,
      onReset,
      outputToken,
      toggle,
    ],
  );
};

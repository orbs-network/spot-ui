import { useCallback, useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotRuntime } from "../context/spot-runtime-context";
import { useSpotStore } from "../context/spot-store-context";
import { observe } from "../execution-state";

export const useTriggerPrice = () => {
  const { marketPriceLoading, inputToken, outputToken, callbacks } =
    useSpotRuntime();
  const { marketPrice, trades, triggerPrice, isInverted } = useOrderForm();
  const updateState = useSpotStore((state) => state.updateState);

  const onInputChange = useCallback(
    (value?: string) => {
      updateState({ triggerPriceUi: value, triggerPricePercent: null });
      observe(() => callbacks?.onTriggerPriceChange?.(value || ""));
      observe(() => callbacks?.onTriggerPricePercentChange?.(""));
    },
    [callbacks, updateState],
  );

  const onPercentageChange = useCallback(
    (percentage?: string) => {
      updateState({
        triggerPriceUi: undefined,
        triggerPricePercent: percentage,
      });
      observe(() => callbacks?.onTriggerPriceChange?.(""));
      observe(() => callbacks?.onTriggerPricePercentChange?.(percentage || ""));
    },
    [callbacks, updateState],
  );

  const onReset = useCallback(() => {
    updateState({
      triggerPricePercent: undefined,
      triggerPriceUi: undefined,
    });
  }, [updateState]);

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

import { Module, observe } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useSpotTrading } from "../../provider/trading-context";
import { useSpotStore } from "../../store/store-context";
import { useOrderForm } from "../form-context";

export const useLimitPrice = () => {
  const { marketPriceLoading, inputToken, outputToken, callbacks } =
    useSpotTrading();
  const { limitPrice, values, module, isInverted } = useOrderForm();
  const updateState = useSpotStore((state) => state.updateState);

  const onInputChange = useCallback(
    (value?: string) => {
      updateState({ limitPriceUi: value, limitPricePercent: null });
      observe(() => callbacks?.onLimitPriceChange?.(value || ""));
      observe(() => callbacks?.onLimitPricePercentChange?.(""));
    },
    [callbacks, updateState],
  );

  const onPercentageChange = useCallback(
    (percentage?: string) => {
      updateState({
        limitPriceUi: undefined,
        limitPricePercent: percentage,
      });
      observe(() => callbacks?.onLimitPriceChange?.(""));
      observe(() => callbacks?.onLimitPricePercentChange?.(percentage || ""));
    },
    [callbacks, updateState],
  );

  const onReset = useCallback(() => {
    updateState({
      limitPriceUi: undefined,
      limitPricePercent: undefined,
    });
  }, [updateState]);

  const isEnabled = !values.isMarketOrder;
  const toggle = useCallback(() => {
    updateState({
      isMarketOrder: !values.isMarketOrder,
      ...(!values.isMarketOrder ? { isPriceInverted: false } : {}),
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

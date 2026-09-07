import { useCallback, useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotRuntime, useSpotStore } from "../context/spot-store";
import { invertPriceInput } from "@orbs-network/spot-ui";

export const usePriceDisplay = () => {
  const { inputToken, outputToken } = useSpotRuntime();
  const updateState = useSpotStore((s) => s.updateState);
  const { isInverted, values } = useOrderForm();
  const typedTriggerPrice = useSpotStore((s) => s.state.typedTriggerPrice);
  const typedLimitPrice = useSpotStore((s) => s.state.typedLimitPrice);
  const onInvert = useCallback(() => {
    updateState({
      isInvertedTrade: !isInverted,
      ...(typedTriggerPrice !== undefined
        ? { typedTriggerPrice: invertPriceInput(typedTriggerPrice) }
        : {}),
      ...(typedLimitPrice !== undefined
        ? { typedLimitPrice: invertPriceInput(typedLimitPrice) }
        : {}),
    });
  }, [updateState, isInverted, typedTriggerPrice, typedLimitPrice]);

  return useMemo(
    () => ({
      onInvert,
      isInverted,
      inputToken,
      outputToken,
      displayInputToken: isInverted ? outputToken : inputToken,
      displayOutputToken: isInverted ? inputToken : outputToken,
      isMarketOrder: values.isMarketOrder,
    }),
    [inputToken, isInverted, onInvert, outputToken, values.isMarketOrder],
  );
};

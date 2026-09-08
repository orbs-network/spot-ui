import { useCallback, useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotRuntime } from "../context/spot-runtime-context";
import { useSpotStore } from "../context/spot-store-context";
import { invertPriceInput } from "@orbs-network/spot-ui";

export const usePriceDisplay = () => {
  const { inputToken, outputToken } = useSpotRuntime();
  const updateState = useSpotStore((s) => s.updateState);
  const { isInverted, values } = useOrderForm();
  const triggerPriceUi = useSpotStore((s) => s.state.triggerPriceUi);
  const limitPriceUi = useSpotStore((s) => s.state.limitPriceUi);
  const onInvert = useCallback(() => {
    updateState({
      isPriceInverted: !isInverted,
      ...(triggerPriceUi !== undefined
        ? { triggerPriceUi: invertPriceInput(triggerPriceUi) }
        : {}),
      ...(limitPriceUi !== undefined
        ? { limitPriceUi: invertPriceInput(limitPriceUi) }
        : {}),
    });
  }, [updateState, isInverted, triggerPriceUi, limitPriceUi]);

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

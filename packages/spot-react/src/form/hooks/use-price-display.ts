import { invertPriceInput } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useSpotTrading } from "../../provider/trading-context";
import { useSpotStore } from "../../store/store-context";
import { useOrderForm } from "../form-context";

export const usePriceDisplay = () => {
  const { inputToken, outputToken } = useSpotTrading();
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

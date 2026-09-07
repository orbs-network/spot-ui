import {
  calculateOrderForm,
  toAmountWei,
  type CalculateOrderFormParams,
  type CalculatedOrderForm,
} from "@orbs-network/spot-ui";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ExecutionPhase } from "../types";
import { useSpotRuntime, useSpotStore } from "./spot-store";

const OrderFormContext = createContext<CalculatedOrderForm | null>(null);

export const OrderFormProvider = ({ children }: { children: ReactNode }) => {
  const {
    inputToken,
    outputToken,
    typedInputAmount,
    marketPrice,
    quotedOutputAmount,
    inputUsd1Token,
    outputUsd1Token,
    minTradeSizeUsd,
    inputBalance,
    displayFeePercent,
    priceProtection,
    module,
  } = useSpotRuntime();
  const typedTrades = useSpotStore((store) => store.state.typedTrades);
  const typedFillDelay = useSpotStore((store) => store.state.typedFillDelay);
  const typedDuration = useSpotStore((store) => store.state.typedDuration);
  const typedLimitPrice = useSpotStore(
    (store) => store.state.typedLimitPrice,
  );
  const typedTriggerPrice = useSpotStore(
    (store) => store.state.typedTriggerPrice,
  );
  const limitPricePercent = useSpotStore(
    (store) => store.state.limitPricePercent,
  );
  const triggerPricePercent = useSpotStore(
    (store) => store.state.triggerPricePercent,
  );
  const isInvertedTrade = useSpotStore(
    (store) => store.state.isInvertedTrade,
  );
  const isMarketOrder = useSpotStore((store) => store.state.isMarketOrder);
  const frozenForm = useSpotStore((store) => {
    const execution = store.state.currentExecution;
    return execution.phase !== ExecutionPhase.IDLE
      ? execution.form
      : undefined;
  });
  const inputAmountWei = useMemo(
    () => toAmountWei(typedInputAmount, inputToken?.decimals),
    [inputToken?.decimals, typedInputAmount],
  );

  const params = useMemo<CalculateOrderFormParams>(
    () => ({
      module,
      isMarketOrder: Boolean(isMarketOrder),
      inputAmountWei,
      inputTokenDecimals: inputToken?.decimals ?? 0,
      outputTokenDecimals: outputToken?.decimals ?? 0,
      marketPrice,
      quotedOutputAmount,
      inputUsdPrice: inputUsd1Token,
      outputUsdPrice: outputUsd1Token,
      minTradeSizeUsd,
      trades: typedTrades,
      fillDelay: typedFillDelay,
      duration: typedDuration,
      limitPrice: typedLimitPrice,
      limitPricePercent,
      triggerPrice: typedTriggerPrice,
      triggerPricePercent,
      isInverted: isInvertedTrade,
      priceProtection,
      displayFeePercent,
      inputBalance,
    }),
    [
      outputToken?.decimals,
      outputUsd1Token,
      displayFeePercent,
      inputAmountWei,
      marketPrice,
      quotedOutputAmount,
      minTradeSizeUsd,
      module,
      priceProtection,
      inputBalance,
      inputToken?.decimals,
      inputUsd1Token,
      isInvertedTrade,
      isMarketOrder,
      limitPricePercent,
      triggerPricePercent,
      typedTrades,
      typedDuration,
      typedFillDelay,
      typedLimitPrice,
      typedTriggerPrice,
    ],
  );
  const form = useMemo(() => {
    const calculatedForm = calculateOrderForm(params);
    if (inputToken && outputToken) return calculatedForm;

    // Token decimals are required for meaningful base-unit calculations. Keep
    // the display model available while tokens load, but never report it ready.
    return {
      ...calculatedForm,
      isReady: false,
      canSubmit: false,
    };
  }, [inputToken, outputToken, params]);

  return (
    <OrderFormContext.Provider value={frozenForm ?? form}>
      {children}
    </OrderFormContext.Provider>
  );
};

export const useOrderForm = (): CalculatedOrderForm => {
  const form = useContext(OrderFormContext);
  if (!form) {
    throw new Error("useOrderForm must be used within OrderFormProvider");
  }
  return form;
};

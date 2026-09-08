import {
  calculateOrderForm,
  type CalculateOrderFormParams,
  type CalculatedOrderForm,
} from "@orbs-network/spot-ui";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ExecutionPhase } from "../types";
import { useSpotRuntime } from "./spot-runtime-context";
import { useSpotStore } from "./spot-store-context";

const OrderFormContext = createContext<CalculatedOrderForm | null>(null);

export const OrderFormProvider = ({ children }: { children: ReactNode }) => {
  const {
    inputToken,
    outputToken,
    inputAmountUi,
    quotedOutputAmountRaw,
    inputTokenUsdPrice,
    outputTokenUsdPrice,
    minTradeSizeUsd,
    inputBalanceRaw,
    displayFeePercent,
    priceProtectionPercent,
    module,
  } = useSpotRuntime();
  const tradeCount = useSpotStore((store) => store.state.tradeCount);
  const tradeInterval = useSpotStore((store) => store.state.tradeInterval);
  const orderDuration = useSpotStore((store) => store.state.orderDuration);
  const limitPriceUi = useSpotStore(
    (store) => store.state.limitPriceUi,
  );
  const triggerPriceUi = useSpotStore(
    (store) => store.state.triggerPriceUi,
  );
  const limitPricePercent = useSpotStore(
    (store) => store.state.limitPricePercent,
  );
  const triggerPricePercent = useSpotStore(
    (store) => store.state.triggerPricePercent,
  );
  const isPriceInverted = useSpotStore(
    (store) => store.state.isPriceInverted,
  );
  const isMarketOrder = useSpotStore((store) => store.state.isMarketOrder);
  const frozenForm = useSpotStore((store) => {
    const execution = store.state.currentExecution;
    return execution.phase !== ExecutionPhase.IDLE
      ? execution.form
      : undefined;
  });
  const params = useMemo<CalculateOrderFormParams>(
    () => ({
      module,
      inputTokenDecimals: inputToken?.decimals ?? 0,
      outputTokenDecimals: outputToken?.decimals ?? 0,
      quotedOutputAmountRaw,
      inputTokenUsdPrice,
      outputTokenUsdPrice,
      minTradeSizeUsd,
      priceProtectionPercent,
      displayFeePercent,
      inputBalanceRaw,
      userInput: {
        inputAmountUi,
        isMarketOrder: Boolean(isMarketOrder),
        tradeCount,
        tradeInterval,
        orderDuration,
        limitPriceUi,
        limitPricePercent,
        triggerPriceUi,
        triggerPricePercent,
        isPriceInverted,
      },
    }),
    [
      outputToken?.decimals,
      outputTokenUsdPrice,
      displayFeePercent,
      quotedOutputAmountRaw,
      minTradeSizeUsd,
      module,
      priceProtectionPercent,
      inputBalanceRaw,
      inputToken?.decimals,
      inputTokenUsdPrice,
      isPriceInverted,
      isMarketOrder,
      limitPricePercent,
      triggerPricePercent,
      tradeCount,
      orderDuration,
      tradeInterval,
      limitPriceUi,
      inputAmountUi,
      triggerPriceUi,
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

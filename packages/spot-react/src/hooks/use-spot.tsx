import React, { createContext, useContext } from "react";
import { useTradesPanel } from "./use-trades";
import { useDurationPanel } from "./use-duration";
import { useFillDelayPanel } from "./use-fill-delay";
import { useLimitPricePanel } from "./use-limit-price-panel";
import { useTriggerPricePanel } from "./use-trigger-price-panel";
import { usePricePanel } from "./use-price-panel";
import { useDstTokenPanel } from "./use-dst-token-panel";
import { useDisclaimer } from "./use-disclaimer";
import { useInputErrors } from "./use-input-errors";
import {
  useSubmitOrderButton,
  useSubmitOrderPanel,
} from "./use-submit-order-panel";
import { useFormData } from "./use-form-data";
import { useOrderHistoryPanel } from "./order-hooks";
import { usePartnerChains } from "./use-partner-chains";
import {
  useCancelOrderRefetchUntilStatusSynced,
} from "./use-cancel-order";
import { useSpotContext } from "../spot-context";
import { Module } from "@orbs-network/spot-ui";

type SpotData = {
  tradesAmountPanel: ReturnType<typeof useTradesPanel>;
  durationPanel: ReturnType<typeof useDurationPanel>;
  fillDelayPanel: ReturnType<typeof useFillDelayPanel>;
  limitPricePanel: ReturnType<typeof useLimitPricePanel>;
  triggerPricePanel: ReturnType<typeof useTriggerPricePanel>;
  pricePanel: ReturnType<typeof usePricePanel>;
  dstTokenPanel: ReturnType<typeof useDstTokenPanel>;
  disclaimerPanel: ReturnType<typeof useDisclaimer>;
  inputError: ReturnType<typeof useInputErrors>;
  submitOrderButton: ReturnType<typeof useSubmitOrderButton>;
  orderHistoryPanel: ReturnType<typeof useOrderHistoryPanel>;
  orderExecutionPanel: ReturnType<typeof useSubmitOrderPanel>;
  derivedFormData: ReturnType<typeof useFormData>;
  supportedChains: ReturnType<typeof usePartnerChains>;
  module: Module;
  refetchUntilStatusSynced: ReturnType<
    typeof useCancelOrderRefetchUntilStatusSynced
  >;
};

const SpotDataContext = createContext<SpotData | null>(null);

export const SpotDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const tradesAmountPanel = useTradesPanel();
  const durationPanel = useDurationPanel();
  const fillDelayPanel = useFillDelayPanel();
  const limitPricePanel = useLimitPricePanel();
  const triggerPricePanel = useTriggerPricePanel();
  const pricePanel = usePricePanel();
  const dstTokenPanel = useDstTokenPanel();
  const disclaimerPanel = useDisclaimer();
  const inputError = useInputErrors();
  const submitOrderButton = useSubmitOrderButton();
  const derivedFormData = useFormData();
  const orderHistoryPanel = useOrderHistoryPanel();
  const orderExecutionPanel = useSubmitOrderPanel();
  const supportedChains = usePartnerChains();
  const refetchUntilStatusSynced = useCancelOrderRefetchUntilStatusSynced();
  const { module } = useSpotContext();

  const value = {
    tradesAmountPanel,
    durationPanel,
    fillDelayPanel,
    limitPricePanel,
    triggerPricePanel,
    pricePanel,
    dstTokenPanel,
    disclaimerPanel,
    inputError,
    submitOrderButton,
    derivedFormData,
    orderHistoryPanel,
    orderExecutionPanel,
    supportedChains,
    refetchUntilStatusSynced,
    module,
  };

  return (
    <SpotDataContext.Provider value={value}>
      {children}
    </SpotDataContext.Provider>
  );
};

export const useSpot = () => {
  const value = useContext(SpotDataContext);
  if (value === null) {
    throw new Error("useSpot must be used within SpotProvider");
  }
  return value;
};

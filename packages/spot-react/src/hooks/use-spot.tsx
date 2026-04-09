import React, { createContext, useContext, useMemo } from "react";
import { useTradesPanel } from "./use-trades";
import { useDurationPanel } from "./use-duration";
import { useFillDelayPanel } from "./use-fill-delay";
import { useLimitPricePanel } from "./use-limit-price-panel";
import { useTriggerPricePanel } from "./use-trigger-price-panel";
import { usePricePanel } from "./use-price-panel";
import { useDstTokenPanel } from "./use-dst-token-panel";
import { useDisclaimerMessage } from "./use-disclaimer-message";
import { useInputErrors } from "./use-input-errors";
import {
  useSubmitOrderButton,
  useSubmitOrderPanel,
} from "./use-submit-order-panel";
import { useFormData } from "./use-form-data";
import { useOrderHistoryPanel } from "./order-hooks";
import { usePartnerChains } from "./use-partner-chains";
import {
  useCancelOrderMutation,
  useCancelOrderRefetchUntilStatusSynced,
} from "./use-cancel-order";
import { useSignOrder, useSubmitOrderMutation } from "./use-submit-order";

type SpotData = {
  tradesPanel: ReturnType<typeof useTradesPanel>;
  durationPanel: ReturnType<typeof useDurationPanel>;
  fillDelayPanel: ReturnType<typeof useFillDelayPanel>;
  limitPricePanel: ReturnType<typeof useLimitPricePanel>;
  triggerPricePanel: ReturnType<typeof useTriggerPricePanel>;
  pricePanel: ReturnType<typeof usePricePanel>;
  dstTokenPanel: ReturnType<typeof useDstTokenPanel>;
  disclaimerMessage: ReturnType<typeof useDisclaimerMessage>;
  inputError: ReturnType<typeof useInputErrors>;
  submitOrderButton: ReturnType<typeof useSubmitOrderButton>;
  orderHistoryPanel: ReturnType<typeof useOrderHistoryPanel>;
  derivedFormData: ReturnType<typeof useFormData>;
  submitOrderPanel: ReturnType<typeof useSubmitOrderPanel>;
  supportedChains: ReturnType<typeof usePartnerChains>;
  mutations: {
    cancelOrder: ReturnType<typeof useCancelOrderMutation>;
    signOrder: ReturnType<typeof useSignOrder>;
    submitOrder: ReturnType<typeof useSubmitOrderMutation>;
    refetchUntilStatusSynced: ReturnType<
      typeof useCancelOrderRefetchUntilStatusSynced
    >;
  };
};

const SpotDataContext = createContext<SpotData | null>(null);

export const SpotDataProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const tradesPanel = useTradesPanel();
  const durationPanel = useDurationPanel();
  const fillDelayPanel = useFillDelayPanel();
  const limitPricePanel = useLimitPricePanel();
  const triggerPricePanel = useTriggerPricePanel();
  const pricePanel = usePricePanel();
  const dstTokenPanel = useDstTokenPanel();
  const disclaimerMessage = useDisclaimerMessage();
  const inputError = useInputErrors();
  const submitOrderButton = useSubmitOrderButton();
  const derivedFormData = useFormData();
  const orderHistoryPanel = useOrderHistoryPanel();
  const orderExecutionPanel = useSubmitOrderPanel();
  const supportedChains = usePartnerChains();

  const cancelOrder = useCancelOrderMutation();
  const signOrder = useSignOrder();
  const submitOrder = useSubmitOrderMutation();
  const refetchUntilStatusSynced = useCancelOrderRefetchUntilStatusSynced();

  const mutations = useMemo(
    () => ({ cancelOrder, signOrder, submitOrder, refetchUntilStatusSynced }),
    [cancelOrder, signOrder, submitOrder, refetchUntilStatusSynced],
  );

  

  const value = {
    tradesPanel,
    durationPanel,
    fillDelayPanel,
    limitPricePanel,
    triggerPricePanel,
    pricePanel,
    dstTokenPanel,
    disclaimerMessage,    
    inputError,
    submitOrderButton,
    derivedFormData,
    orderHistoryPanel,
    submitOrderPanel: orderExecutionPanel,
    supportedChains,
    mutations,
  }
  

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

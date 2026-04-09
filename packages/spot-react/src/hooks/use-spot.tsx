import React, { createContext, useContext, useMemo } from "react";
import { useTradesPanel } from "./use-trades";
import { useDurationPanel } from "./use-duration";
import { useFillDelayPanel } from "./use-fill-delay";
import { useLimitPricePanel } from "./use-limit-price-panel";
import { useTriggerPricePanel } from "./use-trigger-price-panel";
import { useInvertTradePanel } from "./use-invert-trade-panel";
import { useDstTokenPanel } from "./use-dst-token-panel";
import { useDisclaimerPanel } from "./use-disclaimer-panel";
import { useInputErrors } from "./use-input-errors";
import {
  useSubmitOrderButton,
  useSubmitOrderPanel,
} from "./use-submit-order-panel";
import { useFormData } from "./use-form-data";
import { useOrderHistoryPanel } from "./order-hooks";
import { usePartnerChains } from "./use-partner-chains";
import { useAddresses } from "./use-addresses";
import {
  useCancelOrderMutation,
  useCancelOrderRefetchUntilStatusSynced,
} from "./use-cancel-order";
import { useSignOrder, useSubmitOrderMutation } from "./use-submit-order";

type SpotData = {
  trades: ReturnType<typeof useTradesPanel>;
  duration: ReturnType<typeof useDurationPanel>;
  fillDelay: ReturnType<typeof useFillDelayPanel>;
  limitPrice: ReturnType<typeof useLimitPricePanel>;
  triggerPrice: ReturnType<typeof useTriggerPricePanel>;
  invertTrade: ReturnType<typeof useInvertTradePanel>;
  dstToken: ReturnType<typeof useDstTokenPanel>;
  disclaimer: ReturnType<typeof useDisclaimerPanel>;
  inputError: ReturnType<typeof useInputErrors>;
  submitButton: ReturnType<typeof useSubmitOrderButton>;
  orderHistory: ReturnType<typeof useOrderHistoryPanel>;
  formData: ReturnType<typeof useFormData>;
  orderExecution: ReturnType<typeof useSubmitOrderPanel>;
  supportedChains: ReturnType<typeof usePartnerChains>;
  spender: `0x${string}`;
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
  const trades = useTradesPanel();
  const duration = useDurationPanel();
  const fillDelay = useFillDelayPanel();
  const limitPrice = useLimitPricePanel();
  const triggerPrice = useTriggerPricePanel();
  const invertTrade = useInvertTradePanel();
  const dstToken = useDstTokenPanel();
  const disclaimer = useDisclaimerPanel();
  const inputError = useInputErrors();
  const submitButton = useSubmitOrderButton();
  const formData = useFormData();
  const orderHistory = useOrderHistoryPanel();
  const orderExecution = useSubmitOrderPanel();
  const supportedChains = usePartnerChains();
  const { spender } = useAddresses();

  const cancelOrder = useCancelOrderMutation();
  const signOrder = useSignOrder();
  const submitOrder = useSubmitOrderMutation();
  const refetchUntilStatusSynced = useCancelOrderRefetchUntilStatusSynced();

  const mutations = useMemo(
    () => ({
      cancelOrder,
      signOrder,
      submitOrder,
      refetchUntilStatusSynced,
    }),
    [cancelOrder, signOrder, submitOrder, refetchUntilStatusSynced],
  );
  const value = useMemo(
    (): SpotData => ({
      trades,
      duration,
      fillDelay,
      limitPrice,
      triggerPrice,
      invertTrade,
      dstToken,
      disclaimer,
      inputError,
      submitButton,
      formData,
      orderHistory,
      orderExecution,
      supportedChains,
      spender,
      mutations,
    }),
    [
      trades,
      duration,
      fillDelay,
      limitPrice,
      triggerPrice,
      invertTrade,
      dstToken,
      disclaimer,
      inputError,
      submitButton,
      formData,
      orderHistory,
      orderExecution,
      spender,
      mutations,
    ],
  );

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

import { useCallback } from "react";
import { executeOrder } from "../execute-order";
import { useOrderForm } from "../context/order-form-context";
import { useSpotTrading } from "../context/spot-trading-context";
import { useSpotStoreApi } from "../context/spot-store-context";
import { useClient } from "../context/use-client";
import { useAddNewOrder, useRefetchActiveOrders } from "./order-hooks";

export const useSubmitOrder = (): (() => void) => {
  const { data: client } = useClient();
  const {
    inputToken,
    outputToken,
    wrappedNativeToken,
    chainId,
    hasChainId,
    callbacks,
    account,
    walletInteractions,
  } = useSpotTrading();
  const addNewOrder = useAddNewOrder();
  const refetchActiveOrders = useRefetchActiveOrders();
  const form = useOrderForm();
  const store = useSpotStoreApi();

  return useCallback(() => {
    void executeOrder({
      account,
      chainId,
      hasChainId,
      inputToken,
      outputToken,
      wrappedNativeToken,
      form,
      client,
      walletInteractions,
      callbacks,
      addNewOrder,
      refetchActiveOrders,
      getCurrentExecution: () => store.getState().state.currentExecution,
      beginExecution: store.getState().beginExecution,
      replaceExecution: store.getState().replaceExecution,
    }).catch(() => undefined);
  }, [
    account,
    addNewOrder,
    callbacks,
    chainId,
    client,
    form,
    inputToken,
    hasChainId,
    outputToken,
    wrappedNativeToken,
    refetchActiveOrders,
    store,
    walletInteractions,
  ]);
};

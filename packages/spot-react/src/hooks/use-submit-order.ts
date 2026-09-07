import { useCallback } from "react";
import { executeOrder } from "../execute-order";
import { useClient } from "../context/use-client";
import { useOrderForm } from "../context/order-form-context";
import { useSpotRuntime, useSpotStoreApi } from "../context/spot-store";
import { useAddNewOrder, useRefetchActiveOrders } from "./order-hooks";

export const useSubmitOrder = (): (() => void) => {
  const {
    inputToken,
    outputToken,
    chainId,
    isSupportedChain,
    callbacks,
    account,
    walletInteractions,
  } = useSpotRuntime();
  const { data: client } = useClient();
  const addNewOrder = useAddNewOrder();
  const refetchActiveOrders = useRefetchActiveOrders();
  const form = useOrderForm();
  const store = useSpotStoreApi();

  return useCallback(() => {
    void executeOrder({
      account,
      chainId,
      isSupportedChain,
      inputToken,
      outputToken,
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
    isSupportedChain,
    outputToken,
    refetchActiveOrders,
    store,
    walletInteractions,
  ]);
};

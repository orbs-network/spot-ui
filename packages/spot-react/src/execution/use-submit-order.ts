import { executeOrder } from "@orbs-network/spot-ui";
import { useCallback } from "react";
import { useClient } from "../client/use-client";
import { useOrderForm } from "../form/form-context";
import {
  useAddNewOrder,
  useRefetchActiveOrders,
} from "../history/resource-hooks";
import { useSpotTrading } from "../provider/trading-context";
import { useSpotStoreApi } from "../store/store-context";

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

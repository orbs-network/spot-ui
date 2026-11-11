import { useCallback } from "react";
import { updateTrackedOrderInCache } from "../order-cache";
import { executeOrder } from "../execute-order";
import { canBeginExecution } from "../execution-state";
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
    callbacks,
    account,
    walletInteractions,
    partner,
  } = useSpotTrading();
  const addNewOrder = useAddNewOrder();
  const refetchActiveOrders = useRefetchActiveOrders();
  const form = useOrderForm();
  const store = useSpotStoreApi();
  return useCallback(() => {
    if (!canBeginExecution(store.getState().state.currentExecution.phase)) return;
    const controller = store.getState().acquireExecutionController();
    if (!controller) return;
    void executeOrder({
      signal: controller.signal,
      account,
      chainId,
      inputToken,
      outputToken,
      wrappedNativeToken,
      form,
      client,
      partner,
      walletInteractions,
      callbacks,
      addNewOrder,
      refetchActiveOrders,
      onOrderUpdate: (order) => updateTrackedOrderInCache(store, order, callbacks, client?.partner ?? partner),
      subscribeExecution: (listener) => store.subscribe(listener),
      getCurrentExecution: () => store.getState().state.currentExecution,
      getExecution: store.getState().getExecution,
      finishExecution: store.getState().finishExecution,
      queueWrapTransaction: store.getState().queueWrapTransaction,
      beginExecution: store.getState().beginExecution,
      replaceExecution: store.getState().replaceExecution,
    }).catch(() => undefined).finally(() => {
      store.getState().releaseExecutionController(controller);
    });
  }, [
    account,
    addNewOrder,
    callbacks,
    chainId,
    client,
    partner,
    form,
    inputToken,
    outputToken,
    wrappedNativeToken,
    refetchActiveOrders,
    store,
    walletInteractions,
  ]);
};

import { useCallback } from "react";
import { waitForSwapOrder } from "../wait-for-swap-order";
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
    quote,
    partner,
    disableAnalytics,
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
      quote,
      client,
      partner,
      disableAnalytics,
      walletInteractions,
      callbacks,
      addNewOrder,
      refetchActiveOrders,
      waitForOrderFill: (order, executionId) => {
        return waitForSwapOrder({ store, callbacks, order, executionId, signal: controller.signal });
      },
      getCurrentExecution: () => store.getState().state.currentExecution,
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
    disableAnalytics,
    form,
    quote,
    inputToken,
    outputToken,
    wrappedNativeToken,
    refetchActiveOrders,
    store,
    walletInteractions,
  ]);
};

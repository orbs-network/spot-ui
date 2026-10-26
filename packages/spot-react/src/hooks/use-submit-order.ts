import { useCallback, useEffect, useRef } from "react";
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
  } = useSpotTrading();
  const addNewOrder = useAddNewOrder();
  const refetchActiveOrders = useRefetchActiveOrders();
  const form = useOrderForm();
  const store = useSpotStoreApi();
  const settlementController = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => settlementController.current?.abort(), [account, chainId, client]);

  return useCallback(() => {
    if (!canBeginExecution(store.getState().state.currentExecution.phase)) return;
    // Create this before any wallet/API work so cleanup also stops settlement
    // that would otherwise start after an account change or unmount.
    const controller = new AbortController();
    settlementController.current = controller;
    void executeOrder({
      signal: controller.signal,
      account,
      chainId,
      inputToken,
      outputToken,
      wrappedNativeToken,
      form,
      client,
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
      if (settlementController.current === controller) {
        settlementController.current = undefined;
      }
    });
  }, [
    account,
    addNewOrder,
    callbacks,
    chainId,
    client,
    form,
    inputToken,
    outputToken,
    wrappedNativeToken,
    refetchActiveOrders,
    store,
    walletInteractions,
  ]);
};

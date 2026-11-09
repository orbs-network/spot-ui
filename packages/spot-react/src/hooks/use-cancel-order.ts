import { ExecutionStatus } from "../types";
import {
  OrderStatus,
  type Order,
} from "@orbs-network/spot-ui";
import { isTxRejected } from "@orbs-network/spot-ui/internal";
import { useClient } from "../context/use-client";
import { useSpotTrading } from "../context/spot-trading-context";
import {
  useSpotStore,
  useSpotStoreApi,
} from "../context/spot-store-context";
import { useOrdersResource } from "./order-hooks";
import { useCallback, useMemo } from "react";
import {
  getErrorMessage,
  normalizeError,
  observe,
} from "../execution-state";
import { createOperationAnalytics } from "../analytics";

export type CancelOrderStatus = {
  status: ExecutionStatus;
  disabled?: boolean;
  txHash?: string;
  error?: string;
};

export const createCancelledOrder = (order: Order): Order => ({
  ...order,
  status: OrderStatus.Cancelled,
});

export const useCancelOrder = (order?: Order) => {
  const { account, chainId, partner, walletInteractions, callbacks, disableAnalytics } = useSpotTrading();
  const { data: client } = useClient();
  const { key: ordersKey, refetch } = useOrdersResource();
  const store = useSpotStoreApi();
  const cancelOrderEntry = useSpotStore((s) => s.state.cancelOrders[order?.historyKey ?? ""]);
  const setCancelOrder = useSpotStore((s) => s.setCancelOrder);
  const clearCancelOrder = useSpotStore((s) => s.clearCancelOrder);

  const cancelOrder = useCallback(async () => {
    const historyKey = order?.historyKey;
    const previous = store.getState().state.cancelOrders[historyKey ?? ""];
    // Read the shared store so rapid clicks and separate hook callers cannot duplicate a transaction.
    if (previous?.status === ExecutionStatus.LOADING || previous?.status === ExecutionStatus.SUCCESS) {
      return undefined;
    }
    const analytics = createOperationAnalytics({
      account,
      chainId: order?.chainId ?? chainId,
      partner,
      orderId: order?.id,
      inputTokenAddress: order?.srcTokenAddress,
      outputTokenAddress: order?.dstTokenAddress,
      inputAmountRaw: order?.srcAmount,
    }, client, disableAnalytics);

    try {
      if (!account) throw new Error("missing account");
      if (!order) throw new Error("order is required");
      if (!client) throw new Error("Spot client is unavailable");
      const activeHistoryKey = order.historyKey;

      setCancelOrder(activeHistoryKey, { status: ExecutionStatus.LOADING });
      observe(() => callbacks?.onCancelOrderRequest?.(order));

      observe(() =>
        analytics.onCancelOrderRequest(
          [order.version === 1 ? order.id.toString() : order.hash],
          order.version as 1 | 2,
        ),
      );
      const request = client.getCancelOrderRequest(order);
      const txHash = await walletInteractions.cancelOrder(request);

      if (!txHash) throw new Error("failed to cancel order");
      // The wallet adapter returns after confirmation; indexer lag cannot undo that success.
      setCancelOrder(activeHistoryKey, {
        status: ExecutionStatus.SUCCESS,
        txHash,
      });
      const orders = store.getState().orders;
      const currentOrder = orders.key === ordersKey
        ? orders.data?.find(candidate => candidate.historyKey === activeHistoryKey)
        : undefined;
      const cancelledOrder = createCancelledOrder(currentOrder ?? order);
      if (ordersKey && store.getState().orders.key === ordersKey) {
        observe(() => store.getState().updateOrder(cancelledOrder));
      }
      observe(() => analytics.onCancelOrderSuccess(txHash));
      observe(() =>
        callbacks?.onCancelOrderSuccess?.({
          order: cancelledOrder,
          txHash,
        }),
      );
      // Shared history polling reconciles the cache; a failed refresh is not a failed cancel.
      observe(() => refetch(order.version === 1));

      return txHash;
    } catch (error) {
      if (isTxRejected(error)) {
        if (historyKey) clearCancelOrder(historyKey);
      } else {
        if (historyKey) {
          setCancelOrder(historyKey, {
            status: ExecutionStatus.FAILED,
            error: getErrorMessage(error),
          });
        }
      }
      // User rejection is an outcome too, while its existing UI state remains dismissible.
      observe(() => analytics.onCancelOrderError(error));
      observe(() => callbacks?.onCancelOrderFailed?.(normalizeError(error)));
    }
    return undefined;
  }, [
    account,
    chainId,
    partner,
    disableAnalytics,
    callbacks,
    clearCancelOrder,
    client,
    order,
    ordersKey,
    refetch,
    setCancelOrder,
    store,
    walletInteractions,
  ]);

  const cancelOrderState = useMemo(() => {
    const res = cancelOrderEntry;
    return {
      isLoading: res?.status === ExecutionStatus.LOADING,
      disabled: Boolean(order && !client),
      isSuccess: res?.status === ExecutionStatus.SUCCESS,
      isError: res?.status === ExecutionStatus.FAILED,
      error: res?.error,
      txHash: res?.txHash,
    };
  }, [cancelOrderEntry, order, client]);

  return useMemo(() => {
    return { cancelOrder, ...cancelOrderState };
  }, [cancelOrder, cancelOrderState]);
};

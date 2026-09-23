import { ExecutionStatus } from "../types";
import {
  isTxRejected,
  OrderStatus,
  type Order,
} from "@orbs-network/spot-ui";
import { useClient } from "../context/use-client";
import { useSpotTrading } from "../context/spot-trading-context";
import {
  useSpotStore,
} from "../context/spot-store-context";
import { useOrdersResource } from "./order-hooks";
import { useCallback, useMemo } from "react";
import {
  getErrorMessage,
  normalizeError,
  observe,
} from "../execution-state";

const MAX_CANCEL_POLL_ATTEMPTS = 60;

export const useCancelOrderRefetchUntilStatusSynced = () => {
  const { refetch } = useOrdersResource();
  return useCallback(
    async (historyKey: string, refreshLegacy = false): Promise<void> => {
      for (let attempt = 0; attempt < MAX_CANCEL_POLL_ATTEMPTS; attempt++) {
        const orders = await refetch(refreshLegacy);

        if (!orders) {
          throw new Error("orders not found");
        }

        const order = orders.find(
          (candidate) => candidate.historyKey === historyKey,
        );
        if (order?.status === OrderStatus.Cancelled) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error(
        "Timed out waiting for order cancellation to be confirmed",
      );
    },
    [refetch],
  );
};

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
  const { account, walletInteractions, callbacks } = useSpotTrading();
  const { data: client } = useClient();
  const refetchUntilStatusSynced = useCancelOrderRefetchUntilStatusSynced();
  const cancelOrderEntry = useSpotStore((s) => s.state.cancelOrders[order?.historyKey ?? ""]);
  const setCancelOrder = useSpotStore((s) => s.setCancelOrder);
  const clearCancelOrder = useSpotStore((s) => s.clearCancelOrder);

  const cancelOrder = useCallback(async () => {
    const historyKey = order?.historyKey;

    try {
      if (!account) throw new Error("missing account");
      if (!order) throw new Error("order is required");
      if (!client) throw new Error("Spot client is unavailable");
      const activeHistoryKey = order.historyKey;

      setCancelOrder(activeHistoryKey, { status: ExecutionStatus.LOADING });
      observe(() => callbacks?.onCancelOrderRequest?.(order));

      observe(() =>
        client.analytics.onCancelOrderRequest(
          [order.version === 1 ? order.id.toString() : order.hash],
          order.version as 1 | 2,
        ),
      );
      const request = client.getCancelOrderRequest(order);
      const txHash = await walletInteractions.cancelOrder(request);

      if (!txHash) throw new Error("failed to cancel order");
      observe(() => client.analytics.onCancelOrderSuccess(txHash));

      // Keep the loader active until server history reflects the cancellation.
      setCancelOrder(activeHistoryKey, {
        status: ExecutionStatus.LOADING,
        txHash,
      });
      await refetchUntilStatusSynced(activeHistoryKey, order.version === 1);
      const cancelledOrder = createCancelledOrder(order);
      setCancelOrder(activeHistoryKey, {
        status: ExecutionStatus.SUCCESS,
        txHash,
      });
      observe(() =>
        callbacks?.onCancelOrderSuccess?.({
          order: cancelledOrder,
          txHash,
        }),
      );

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
        observe(() => client?.analytics.onCancelOrderError(error));
      }
      observe(() => callbacks?.onCancelOrderFailed?.(normalizeError(error)));
    }
    return undefined;
  }, [
    account,
    callbacks,
    clearCancelOrder,
    client,
    order,
    refetchUntilStatusSynced,
    setCancelOrder,
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

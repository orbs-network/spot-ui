import { ExecutionStatus } from "../types";
import {
  analytics,
  isTxRejected,
  OrderStatus,
  type Order,
} from "@orbs-network/spot-ui";
import { useClient } from "../context/use-client";
import { useSpotRuntime } from "../context/spot-runtime-context";
import {
  useSpotStore,
  useSpotStoreApi,
} from "../context/spot-store-context";
import { useOrdersResource, useUpdateCachedOrderStatus } from "./order-hooks";
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
    async (historyKey: string): Promise<void> => {
      for (let attempt = 0; attempt < MAX_CANCEL_POLL_ATTEMPTS; attempt++) {
        const orders = await refetch();

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

const useCancelOrderState = () => {
  const store = useSpotStoreApi();
  const updateState = useSpotStore((s) => s.updateState);
  const cancelOrders = useSpotStore((s) => s.state.cancelOrders);

  return {
    cancelOrders,
    setCancelOrder: (
      orderId: string,
      data: { status: ExecutionStatus; txHash?: string; error?: string },
    ) => {
      // Read the latest state at write time to avoid clobbering concurrent
      // cancellations with a stale render-time snapshot.
      const current = store.getState().state.cancelOrders;
      updateState({
        cancelOrders: { ...current, [orderId]: data },
      });
    },
    clearCancelOrder: (orderId: string) => {
      const current = store.getState().state.cancelOrders;
      const { [orderId]: _, ...rest } = current;
      updateState({ cancelOrders: rest });
    },
  };
};

export type CancelOrderStatus = {
  status: ExecutionStatus;
  disabled?: boolean;
  txHash?: string;
  error?: string;
};

export const useCancelOrder = (order?: Order) => {
  const { account, walletInteractions, callbacks } = useSpotRuntime();
  const { data: client } = useClient();
  const refetchUntilStatusSynced = useCancelOrderRefetchUntilStatusSynced();
  const updateCachedOrderStatus = useUpdateCachedOrderStatus();
  const {
    cancelOrders: cancelOrdersState,
    setCancelOrder,
    clearCancelOrder,
  } = useCancelOrderState();

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
        analytics.onCancelOrderRequest(
          [order.version === 1 ? order.id.toString() : order.hash],
          order.version as 1 | 2,
        ),
      );
      const request = client.getCancelOrderRequest(order);
      const txHash = await walletInteractions.cancelOrder(request);

      if (!txHash) throw new Error("failed to cancel order");
      observe(() => analytics.onCancelOrderSuccess(txHash));

      // The cancel is confirmed on-chain once we have a txHash. Update the
      // cache optimistically for both versions so an indexer lag doesn't get
      // reported to the user as a failed cancellation.
      updateCachedOrderStatus(activeHistoryKey, OrderStatus.Cancelled);
      setCancelOrder(activeHistoryKey, {
        status: ExecutionStatus.SUCCESS,
        txHash,
      });
      observe(() =>
        callbacks?.onCancelOrderSuccess?.({
          order:
            order.version === 1
              ? { ...order, status: OrderStatus.Cancelled }
              : order,
          txHash,
        }),
      );

      if (order.version !== 1) {
        // The wallet adapter resolves after on-chain confirmation. Reconcile
        // indexer state in the background without keeping the UI loading.
        void refetchUntilStatusSynced(activeHistoryKey).catch((syncError) => {
          console.warn("cancel status sync lagging", syncError);
        });
      }

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
        observe(() => analytics.onCancelOrderError(error));
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
    updateCachedOrderStatus,
    walletInteractions,
  ]);

  const cancelOrderState = useMemo(() => {
    const res = cancelOrdersState[order?.historyKey || ""];
    return {
      isLoading: res?.status === ExecutionStatus.LOADING,
      disabled: Boolean(order && !client),
      isSuccess: res?.status === ExecutionStatus.SUCCESS,
      isError: res?.status === ExecutionStatus.FAILED,
      error: res?.error,
      txHash: res?.txHash,
    };
  }, [cancelOrdersState, order, client]);

  return useMemo(() => {
    return { cancelOrder, ...cancelOrderState };
  }, [cancelOrder, cancelOrderState]);
};

import { SwapStatus } from "../types";
import { analytics, Order, OrderStatus, REPERMIT_ABI, TWAP_ABI } from "@orbs-network/spot-ui";
import { useMutation } from "@tanstack/react-query";
import { useSpotContext } from "../spot-context";
import { getExplorerUrl, isTxRejected } from "../utils";
import { useSpotStore } from "../store";
import { useOrdersQuery, useUpdateCachedOrderStatus } from "./order-hooks";
import { useCallback, useMemo } from "react";

const MAX_CANCEL_POLL_ATTEMPTS = 60;

export const useCancelOrderRefetchUntilStatusSynced = () => {
  const { refetch: refetchOrders } = useOrdersQuery();

  return useMutation({
    mutationFn: async (orderId: string) => {
      for (let attempt = 0; attempt < MAX_CANCEL_POLL_ATTEMPTS; attempt++) {
        const orders = (await refetchOrders())?.data;

        if (!orders) {
          throw new Error("orders not found");
        }

        const order = orders.find((o) => o.id === orderId);
        if (order?.status === OrderStatus.Cancelled) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error(
        "Timed out waiting for order cancellation to be confirmed",
      );
    },
  });
};

const useCancelOrderState = () => {
  const updateState = useSpotStore((s) => s.updateState);
  const cancelOrders = useSpotStore((s) => s.state.cancelOrders);

  return {
    cancelOrders,
    setCancelOrder: (
      orderId: string,
      data: { status: SwapStatus; txHash?: string; error?: string },
    ) => {
      // Read the latest state at write time to avoid clobbering concurrent
      // cancellations with a stale render-time snapshot.
      const current = useSpotStore.getState().state.cancelOrders;
      updateState({
        cancelOrders: { ...current, [orderId]: data },
      });
    },
    clearCancelOrder: (orderId: string) => {
      const current = useSpotStore.getState().state.cancelOrders;
      const { [orderId]: _, ...rest } = current;
      updateState({ cancelOrders: rest });
    },
  };
};

export type CancelOrderStatus = {
  status: SwapStatus;
  txHash?: string;
  error?: string;
};

export const useCancelOrder = (order?: Order) => {
  const { account, walletInteractions, config, callbacks, chainId } =
    useSpotContext();
  const refetchUntilStatusSynced =
    useCancelOrderRefetchUntilStatusSynced().mutateAsync;
  const updateCachedOrderStatus = useUpdateCachedOrderStatus();
  const {
    cancelOrders: cancelOrdersState,
    setCancelOrder,
    clearCancelOrder,
  } = useCancelOrderState();

  const { mutateAsync: cancelOrderMf } = useMutation({
    mutationFn: async () => {
      if (!account || !walletInteractions || !config) {
        throw new Error("missing required parameters");
      }

      if (!order) {
        throw new Error("order is required");
      }

      const orderId = order.id;

      try {
        callbacks?.onCancelOrderRequest?.(order);
        setCancelOrder(orderId, { status: SwapStatus.LOADING });

        analytics.onCancelOrderRequest(
          [order.version === 1 ? order.id.toString() : order.hash],
          order.version as 1 | 2,
        );
        const txHash = await walletInteractions!.cancelOrder({
          order,
          contractAddress:
            order.version === 1 ? order.twapAddress! : config!.repermit,
          args: order.version === 1 ? [order.id] : [[order.repermitDigest]],
          abi: order.version === 1 ? TWAP_ABI : REPERMIT_ABI,
        });

        if (!txHash) throw new Error("failed to cancel order");
        analytics.onCancelOrderSuccess(txHash);

        // The cancel is confirmed on-chain once we have a txHash. Update the
        // cache optimistically for both versions so an indexer lag doesn't get
        // reported to the user as a failed cancellation.
        updateCachedOrderStatus(order.id, OrderStatus.Cancelled);
        if (order.version !== 1) {
          // Best-effort reconcile with the indexer; a timeout here must not
          // flip an already-successful cancel to FAILED.
          try {
            await refetchUntilStatusSynced(order.id);
          } catch (syncError) {
            console.warn("cancel status sync lagging", syncError);
          }
        }

        callbacks?.onCancelOrderSuccess?.({
          order:
            order.version === 1
              ? { ...order, status: OrderStatus.Cancelled }
              : order,
          txHash,
          explorerUrl: getExplorerUrl(txHash, chainId),
        });
        setCancelOrder(orderId, { status: SwapStatus.SUCCESS, txHash });
        return txHash;
      } catch (error) {
        console.error("cancel order error", error);
        callbacks?.onCancelOrderFailed?.(error as Error);

        if (isTxRejected(error)) {
          clearCancelOrder(orderId);
        } else {
          setCancelOrder(orderId, {
            status: SwapStatus.FAILED,
            error: (error as Error).message,
          });
          analytics.onCancelOrderError(error);
        }
      }
    },
  });

  const cancelOrderState = useMemo(() => {
    const res = cancelOrdersState[order?.id || ""];
    return {
      isLoading: res?.status === SwapStatus.LOADING,
      isSuccess: res?.status === SwapStatus.SUCCESS,
      isError: res?.status === SwapStatus.FAILED,
      error: res?.error,
      txHash: res?.txHash,
    };
  }, [cancelOrdersState, order?.id]);

  const cancelOrder = useCallback(async () => {
    return cancelOrderMf();
  }, [cancelOrderMf]);

  return useMemo(() => {
    return { cancelOrder, ...cancelOrderState };
  }, [cancelOrder, cancelOrderState]);
};

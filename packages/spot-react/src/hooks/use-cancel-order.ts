import { SwapStatus } from "../types";
import { analytics, Order, OrderStatus } from "@orbs-network/spot-ui";
import { useMutation } from "@tanstack/react-query";
import { useSpotContext } from "../spot-context";
import { getExplorerUrl, isTxRejected } from "../utils";
import { useSpotStore } from "../store";
import { useOrdersQuery } from "./order-hooks";
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
      updateState({
        cancelOrders: { ...cancelOrders, [orderId]: data },
      });
    },
    clearCancelOrder: (orderId: string) => {
      const { [orderId]: _, ...rest } = cancelOrders;
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
          args: order.version === 1 ? [order.id] : [[order.hash]],
        });

        if (!txHash) throw new Error("failed to cancel order");
        analytics.onCancelOrderSuccess(txHash);

        await refetchUntilStatusSynced(order.id);

        callbacks?.onCancelOrderSuccess?.({
          order,
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

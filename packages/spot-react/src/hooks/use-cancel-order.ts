import { SwapStatus } from "../types";
import {
  analytics,
  Order,
  OrderStatus,
  REPERMIT_ABI,
  TWAP_ABI,
} from "@orbs-network/spot-ui";
import { useMutation } from "@tanstack/react-query";
import { useSpotContext } from "../spot-context";
import { getExplorerUrl, isTxRejected } from "../utils";
import { useGetTransactionReceipt } from "./use-get-transaction-receipt";
import { useSpotStore } from "../store";
import { useOrdersQuery } from "./order-hooks";

const MAX_CANCEL_POLL_ATTEMPTS = 60;

export const useCancelOrderRefetchUntilStatusSynced = () => {
  const { refetch: refetchOrders } = useOrdersQuery();

  return useMutation({
    mutationFn: async (orderIds: string[]) => {
      for (let attempt = 0; attempt < MAX_CANCEL_POLL_ATTEMPTS; attempt++) {
        const orders = (await refetchOrders())?.data;

        if (!orders) {
          throw new Error("orders not found");
        }

        const allCanceled = orderIds.every((id) => {
          const order = orders.find((o) => o.id === id);
          return order?.status === OrderStatus.Cancelled;
        });

        if (allCanceled) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Timed out waiting for order cancellation to be confirmed");
    },
  });
};

export const useCancelOrderMutation = () => {
  const { account, walletClient, publicClient, config, callbacks, chainId } =
    useSpotContext();
  const getTransactionReceipt = useGetTransactionReceipt();
  const refetchUntilStatusSynced =
  useCancelOrderRefetchUntilStatusSynced().mutateAsync;
  const updateState = useSpotStore((s) => s.updateState);

  const cancelOrdersV1 = async (orders: Order[]) => {
    analytics.onCancelOrderRequest(
      orders.map((o) => o.id.toString()),
      1
    );
    try {
      const hashes = await Promise.all(
        orders.map((order) =>
          walletClient!.writeContract({
            account: account as `0x${string}`,
            address: order.twapAddress as `0x${string}`,
            abi: TWAP_ABI,
            functionName: "cancel",
            args: [order.id],
            chain: walletClient!.chain,
          })
        )
      );

      return hashes[0];
    } catch (error) {
      analytics.onCancelOrderError(error);
      throw error;
    }
  };

  const cancelOrdersV2 = async (orders: Order[]) => {
    try {
      analytics.onCancelOrderRequest(
        orders.map((o) => o.hash),
        2
      );
      const hash = await walletClient!.writeContract({
        account: account as `0x${string}`,
        address: config!.repermit,
        abi: REPERMIT_ABI,
        functionName: "cancel",
        args: [orders.map((order) => order.hash)],
        chain: walletClient!.chain,
      });

      const receipt = await getTransactionReceipt(hash!);
      if (!receipt) throw new Error("failed to get transaction receipt");
      if (receipt.status === "reverted")
        throw new Error("failed to cancel order");

      analytics.onCancelOrderSuccess(hash);
    
      return receipt.transactionHash;
    } catch (error) {
      analytics.onCancelOrderError(error);
      throw error;
    }
  };

  return useMutation({
    mutationFn: async ({ orders }: { orders: Order[] }) => {
      if (!account || !walletClient || !publicClient || !config) {
        throw new Error("missing required parameters");
      }

      try {
        callbacks?.onCancelOrderRequest?.(orders);

        updateState({
          cancelOrderStatus: SwapStatus.LOADING,
          cancelOrderTxHash: undefined,
          cancelOrderError: undefined,
        });

        const ordersV1 = orders.filter((o) => o.version === 1);
        const ordersV2 = orders.filter((o) => o.version === 2);

        const [v1Results, v2Result] = await Promise.all([
          ordersV1.length ? cancelOrdersV1(ordersV1) : Promise.resolve(""),
          ordersV2.length ? cancelOrdersV2(ordersV2) : Promise.resolve(""),
        ]);
        await refetchUntilStatusSynced(orders.map((o) => o.id));

    
        const txHash = v1Results || v2Result;
        callbacks?.onCancelOrderSuccess?.({
          orders,
          txHash: txHash,
          explorerUrl: getExplorerUrl(txHash, chainId),
        });
        updateState({
          cancelOrderStatus: SwapStatus.SUCCESS,
        });
        return [v1Results, v2Result].filter(Boolean);
      } catch (error) {
        console.error("cancel order error", error);
        callbacks?.onCancelOrderFailed?.(error as Error);

        if (isTxRejected(error)) {
          updateState({ cancelOrderStatus: undefined });
        } else {
          updateState({ cancelOrderStatus: SwapStatus.FAILED });
          analytics.onCancelOrderError(error);
        }
      }
    },
  });
};

import { ExecutionStatus } from "../types";
import {
  OrderStatus,
  type Order,
  type SpotClient,
} from "@orbs-network/spot-ui";
import { isTxRejected } from "@orbs-network/spot-ui/internal";
import { useClient } from "../context/use-client";
import { useSpotTrading } from "../context/spot-trading-context";
import {
  useSpotStore,
  useSpotStoreApi,
} from "../context/spot-store-context";
import { useOrdersResource } from "./order-hooks";
import { useCallback, useEffect, useMemo, useRef } from "react";
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

const matchesCancellationScope = (
  order: Order | undefined,
  account: string | undefined,
  chainId: number | undefined,
  partner: SpotClient["partner"],
  client: SpotClient | undefined,
): boolean => Boolean(order && account && chainId && client &&
  order.chainId === chainId && client.chainId === chainId && client.partner === partner &&
  order.maker.toLowerCase() === account.toLowerCase());

export const useCancelOrder = (order?: Order) => {
  const { account, chainId, partner, walletInteractions, callbacks } = useSpotTrading();
  const { data: client } = useClient();
  const { key: ordersKey, refetch } = useOrdersResource();
  const store = useSpotStoreApi();
  const cancelOrderEntry = useSpotStore((s) => s.state.cancelOrders[order?.historyKey ?? ""]);
  const setCancelOrder = useSpotStore((s) => s.setCancelOrder);
  const clearCancelOrder = useSpotStore((s) => s.clearCancelOrder);
  const liveScope = useRef<{ account: typeof account; chainId: typeof chainId; partner: typeof partner; client: typeof client } | undefined>(
    { account, chainId, partner, client },
  );
  useEffect(() => {
    liveScope.current = { account, chainId, partner, client };
    return () => { liveScope.current = undefined; };
  }, [account, chainId, partner, client, order?.historyKey, order?.chainId, order?.maker]);

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
    }, client);
    const capturedScope = liveScope.current;
    const checkScope = (): void => {
      if (!capturedScope || liveScope.current !== capturedScope ||
        capturedScope.account?.toLowerCase() !== account?.toLowerCase() ||
        capturedScope.chainId !== chainId || capturedScope.partner !== partner || capturedScope.client !== client ||
        !matchesCancellationScope(order, account, chainId, partner, client)) {
        throw new Error("The order does not match the current wallet or network. Check its status before cancelling again.");
      }
    };
    let confirmedTxHash: `0x${string}` | undefined;

    try {
      if (!account) throw new Error("missing account");
      if (!order) throw new Error("order is required");
      if (!client) throw new Error("Spot client is unavailable");
      checkScope();
      const activeHistoryKey = order.historyKey;
      const reviewedOrder = structuredClone(order);

      setCancelOrder(activeHistoryKey, { status: ExecutionStatus.LOADING });
      observe(() => callbacks?.onCancelOrderRequest?.(order));

      observe(() =>
        analytics.onCancelOrderRequest(
          [order.version === 1 ? order.id.toString() : order.hash],
          order.version as 1 | 2,
        ),
      );
      checkScope();
      const request = await client.getCancelOrderRequest(reviewedOrder);
      checkScope();
      const txHash = await walletInteractions.cancelOrder(request);

      if (!txHash) throw new Error("failed to cancel order");
      confirmedTxHash = txHash;
      checkScope();
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
            ...(confirmedTxHash ? { txHash: confirmedTxHash } : {}),
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
      disabled: !matchesCancellationScope(order, account, chainId, partner, client),
      isSuccess: res?.status === ExecutionStatus.SUCCESS,
      isError: res?.status === ExecutionStatus.FAILED,
      error: res?.error,
      txHash: res?.txHash,
    };
  }, [cancelOrderEntry, order, account, chainId, partner, client]);

  return useMemo(() => {
    return { cancelOrder, ...cancelOrderState };
  }, [cancelOrder, cancelOrderState]);
};

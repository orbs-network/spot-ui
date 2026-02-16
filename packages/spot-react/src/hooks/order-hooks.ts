import {
  getOrderFillDelayMillis,
  getAccountOrders,
  Order,
  OrderStatus,
  OrderType,
  getOrderExcecutionRate,
  getOrderLimitPriceRate,
  getTriggerPricePerTrade,
} from "@orbs-network/spot-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { REFETCH_ORDER_HISTORY } from "../consts";
import { useSpotContext } from "../spot-context";
import { Token } from "../types";
import { useCancelOrderMutation } from "./use-cancel-order";
import { useSpotStore } from "../store";
import { useTranslations } from "./use-translations";
import { useHistoryOrder } from "./use-history-order";
import { Module } from "@orbs-network/spot-ui";




export const useOrderTitle = (type?: OrderType) => {
  const t = useTranslations();
  return useMemo(() => {
   switch (type) {
    case OrderType.TWAP_MARKET:
      return t("twapMarket");
    case OrderType.TWAP_LIMIT:
      return t("twapLimit");
    case OrderType.STOP_LOSS_MARKET:
      return t("stopLossMarket");
    case OrderType.STOP_LOSS_LIMIT:
      return t("stopLossLimit");
    case OrderType.TAKE_PROFIT:
      return t("takeProfit");
    default:
      return t("twapMarket");
   }
  }, [t, type]);
};


const useOrderType = () => {
  const { module } = useSpotContext();
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  return useMemo(() => {
    if (module === Module.TWAP) {
      return isMarketOrder ? OrderType.TWAP_MARKET : OrderType.TWAP_LIMIT;
    }
    if (module === Module.LIMIT) {
      return isMarketOrder ? OrderType.LIMIT : OrderType.TWAP_LIMIT;
    }
    if (module === Module.STOP_LOSS) {
      return isMarketOrder ? OrderType.STOP_LOSS_MARKET : OrderType.STOP_LOSS_LIMIT;
    }
    if (module === Module.TAKE_PROFIT) {
      return  OrderType.TAKE_PROFIT
    }
    return OrderType.TWAP_MARKET;
  }, [module, isMarketOrder]);
};


export const useCurrentOrderTitle = () => {
  const orderType = useOrderType();
  return useOrderTitle(orderType);
};

export const useHistoryOrderTitle = (order?: Order) => {
  return useOrderTitle(order?.type);
};


const useOrdersQueryKey = () => {
  const { account, config, chainId } = useSpotContext();
  return useMemo(
    () => ["useTwapOrderHistoryManager", account, config?.adapter, chainId],
    [account, config, chainId],
  );
};

export const useAddNewOrder = () => {
  const queryClient = useQueryClient();
  const { account } = useSpotContext();
  const queryKey = useOrdersQueryKey();
  return useCallback(
    (order: Order) => {
      queryClient.setQueryData(queryKey, (orders?: Order[]) => {
        if (!orders) return [order];
        if (orders?.some((o) => o.id === order.id)) return orders;
        return [order, ...orders];
      });
    },
    [queryClient, queryKey, account],
  );
};

const useOrderFilledCallback = () => {
  const { callbacks, refetchBalances } = useSpotContext();
  const queryClient = useQueryClient();
  const queryKey = useOrdersQueryKey();
  return useCallback(
    (orders: Order[]) => {
      const prevOrders = queryClient.getQueryData(queryKey) as Order[];
      let isProgressUpdated = false;
      const updatedOrders: Order[] = [];

      if (prevOrders) {
        prevOrders.forEach((prevOrder) => {
          const currentOrder = orders.find((o) => o.id === prevOrder.id);

          if (!currentOrder?.twapAddress && prevOrder.twapAddress && currentOrder && currentOrder.progress !== prevOrder.progress) {
            isProgressUpdated = true;
            updatedOrders.push(currentOrder);

            if (currentOrder.status === OrderStatus.Completed) {
              callbacks?.onOrderFilled?.(currentOrder);
            }
          }
        });
      }
      // refetch balances when orders progress is updated
      if (isProgressUpdated) {
        callbacks?.onOrdersProgressUpdate?.(updatedOrders);
        refetchBalances?.();
      }
    },
    [queryClient, queryKey, callbacks, refetchBalances],
  );
};

export const useOrdersQuery = () => {
  const { account, config, chainId } = useSpotContext();

  const queryKey = useOrdersQueryKey();
  const orderFilledCallback = useOrderFilledCallback();
  const query = useQuery<Order[]>({
    refetchInterval: REFETCH_ORDER_HISTORY,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: Infinity,
    queryKey,
    queryFn: async ({ signal }) => {
      if (!account || !chainId || !config) return [];
      const orders = await getAccountOrders({
        signal,
        chainId,
        config,
        account,
      });

      

      orderFilledCallback(orders);
      return orders.map((order) => {
        if (config?.twapConfig) {
          return {
            ...order,
            fillDelayMillis: getOrderFillDelayMillis(order, config.twapConfig),
          };
        }
        return order;
      });
    },
  });
  
  return query;
};

export const useOrders = () => {
  const {
    data: orders,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useOrdersQuery();
  const { mutateAsync: cancelOrder } = useCancelOrderMutation();

  return useMemo(() => {
    return {
      orders: {
        all: orders ?? [],
        open: filterAndSortOrders(orders ?? [], OrderStatus.Open),
        completed: filterAndSortOrders(orders ?? [], OrderStatus.Completed),
        expired: filterAndSortOrders(orders ?? [], OrderStatus.Expired),
        canceled: filterAndSortOrders(orders ?? [], OrderStatus.Canceled),
      },
      isLoading,
      error,
      refetch: () => refetch().then((it) => it.data),
      cancelOrder,
      isRefetching,
    };
  }, [orders, isLoading, error, refetch, cancelOrder, isRefetching]);
};

export const useOrderToDisplay = () => {
  const selectedStatus = useSpotStore((s) => s.state.orderHistoryStatusFilter);
  const { orders } = useOrders();
  return useMemo(() => {
    if (!selectedStatus) {
      return orders.all;
    }

    return (
      orders.all.filter(
        (order) => order.status.toLowerCase() === selectedStatus.toLowerCase(),
      ) || []
    );
  }, [selectedStatus, orders]);
};

const filterAndSortOrders = (orders: Order[], status: OrderStatus) => {
  return orders
    .filter((order) => order.status === status)
    .sort((a, b) => b.createdAt - a.createdAt);
};

export const useOrderLimitPrice = (
  srcToken?: Token,
  dstToken?: Token,
  order?: Order,
) => {
  return useMemo(() => {
    if (!srcToken || !dstToken || !order || order?.isMarketPrice) return;
    return getOrderLimitPriceRate(
      order,
      srcToken?.decimals,
      dstToken?.decimals,
    );
  }, [order, srcToken, dstToken]);
};

export const useOrderTriggerPriceRate = (
  srcToken?: Token,
  dstToken?: Token,
  order?: Order,
) => {
  return useMemo(() => {
    if (!srcToken || !dstToken || !order) return;
    return getTriggerPricePerTrade(order, srcToken.decimals, dstToken.decimals);
  }, [order, srcToken, dstToken]);
};

export const useOrderAvgExcecutionPrice = (
  srcToken?: Token,
  dstToken?: Token,
  order?: Order,
) => {
  return useMemo(() => {
    if (!srcToken || !dstToken || !order) return;
    return getOrderExcecutionRate(order, srcToken.decimals, dstToken.decimals);
  }, [order, srcToken, dstToken]);
};

export const useSelectedOrderIdsToCancel = () => {
  const updateState = useSpotStore((s) => s.updateState);
  const orderIdsToCancel = useSpotStore((s) => s.state.orderIdsToCancel);
  return useCallback(
    (id: string) => {
      if (orderIdsToCancel?.includes(id)) {
        updateState({
          orderIdsToCancel: orderIdsToCancel?.filter(
            (orderId) => orderId !== id,
          ),
        });
      } else {
        updateState({ orderIdsToCancel: [...(orderIdsToCancel || []), id] });
      }
    },
    [updateState, orderIdsToCancel],
  );
};

export const useOrderHistoryPanel = () => {
  const t = useTranslations();
  const {
    orders,
    isLoading: orderLoading,
    refetch,
    isRefetching,
  } = useOrders();
  const { mutateAsync: cancelOrder, isPending: isCancelOrdersLoading } =
    useCancelOrderMutation();
  const ordersToDisplay = useOrderToDisplay();
  const updateState = useSpotStore((s) => s.updateState);
  const selectedStatus = useSpotStore((s) => s.state.orderHistoryStatusFilter);
  const cancelOrdersMode = useSpotStore((s) => s.state.cancelOrdersMode);
  const orderIdsToCancel = useSpotStore((s) => s.state.orderIdsToCancel);
  const onToggleCancelOrdersMode = useCallback(
    (cancelOrdersMode: boolean) =>
      updateState({ cancelOrdersMode, orderIdsToCancel: [] }),
    [updateState],
  );
  const onHideSelectedOrder = useCallback(
    () => updateState({ selectedOrderID: undefined }),
    [updateState],
  );
  const onCancelOrders = useCallback(
    (orders: Order[]) => cancelOrder({ orders }),
    [cancelOrder],
  );
  const onSelectStatus = useCallback(
    (status?: OrderStatus) => updateState({ orderHistoryStatusFilter: status }),
    [],
  );

  const statuses = useMemo(() => {
    const result = Object.keys(OrderStatus).map((it) => {
      return {
        text: it,
        value: it,
      };
    });
    return [{ text: t("allOrders"), value: "" }, ...result];
  }, [t]);

  const onSelectOrder = useSelectedOrderIdsToCancel();
  const selectedOrderID = useSpotStore((s) => s.state.selectedOrderID);
  const selectedOrder = useHistoryOrder(selectedOrderID);
  const ordersToCancel = useMemo(
    () => orders.all.filter((order) => orderIdsToCancel?.includes(order.id)),
    [orders, orderIdsToCancel],
  );
  const onSelectAllOrdersToCancel = useCallback(
    () =>
      updateState({ orderIdsToCancel: orders.open.map((order) => order.id) }),
    [updateState, orders],
  );
  const onCancelOrder = useCallback(
    (order: Order) => {
      return cancelOrder({ orders: [order] }).then((it) => it?.[0] || "");
    },
    [cancelOrder],
  );
  return {
    refetch,
    onHideSelectedOrder,
    onCancelOrders,
    onCancelOrder,
    onSelectStatus,
    onToggleCancelOrdersMode,
    onSelectOrder,
    isRefetching,
    orders,
    ordersToDisplay,
    isLoading: orderLoading,
    selectedOrder: selectedOrderID ? selectedOrder : undefined,
    openOrdersCount: orders?.open?.length || 0,
    isCancelOrdersLoading,
    selectedStatus: selectedStatus || statuses[0]?.value || "",
    statuses,
    cancelOrdersMode,
    ordersToCancel,
    onSelectAllOrdersToCancel,
  };
};

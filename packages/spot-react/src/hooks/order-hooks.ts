import {
  getOrderFillDelayMillis,
  getAccountOrders,
  Order,
  OrderStatus,
  OrderType,
  getOrderExecutionRate,
  getOrderLimitPriceRate,
  getTriggerPricePerTrade,
  OrderFilter,
} from "@orbs-network/spot-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { REFETCH_ORDER_HISTORY } from "../consts";
import { useSpotContext } from "../spot-context";
import { Token } from "../types";
import { useCancelOrderMutation } from "./use-cancel-order";
import { useSpotStore } from "../store";
import { useTranslations } from "./use-translations";
import { Module } from "@orbs-network/spot-ui";
import { useSelectedOrder } from "./use-history-order";

export const useOrderTitle = (type?: OrderType) => {
  const t = useTranslations();
  return useMemo(() => {
    switch (type) {
      case OrderType.TWAP_MARKET:
        return t("twapMarket");
      case OrderType.LIMIT:
        return t("limit");
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

export const useOrderType = () => {
  const { module } = useSpotContext();
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  return useMemo(() => {
    if (module === Module.TWAP) {
      return isMarketOrder ? OrderType.TWAP_MARKET : OrderType.TWAP_LIMIT;
    }
    if (module === Module.LIMIT) {
      return OrderType.LIMIT;
    }
    if (module === Module.STOP_LOSS) {
      return isMarketOrder
        ? OrderType.STOP_LOSS_MARKET
        : OrderType.STOP_LOSS_LIMIT;
    }
    if (module === Module.TAKE_PROFIT) {
      return OrderType.TAKE_PROFIT;
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

          if (
            !currentOrder?.twapAddress &&
            prevOrder.twapAddress &&
            currentOrder &&
            currentOrder.progress !== prevOrder.progress
          ) {
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

const filterAndSortOrders = (
  orders = [] as Order[],
  filter = OrderFilter.All,
) => {
  let _orders = orders ?? [];
  if (filter === OrderFilter.Open) {
    _orders = _orders.filter((order) => order.status === OrderStatus.Open);
  }
  if (filter === OrderFilter.Completed) {
    _orders = _orders.filter((order) => order.status === OrderStatus.Completed);
  }
  if (filter === OrderFilter.Canceled) {
    _orders = _orders.filter((order) => order.status === OrderStatus.Canceled);
  }
  if (filter === OrderFilter.Expired) {
    _orders = _orders.filter((order) => order.status === OrderStatus.Expired);
  }
  return _orders.sort((a, b) => b.createdAt - a.createdAt);
};

export const useOrderToDisplay = () => {
  const selectedOrderFilter = useSpotStore(
    (s) => s.state.orderHistoryStatusFilter,
  );
  const { data: orders } = useOrdersQuery();
  return useMemo(
    () => filterAndSortOrders(orders, selectedOrderFilter),
    [selectedOrderFilter, orders],
  );
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

export const useOrderAvgExecutionPrice = (
  srcToken?: Token,
  dstToken?: Token,
  order?: Order,
) => {
  return useMemo(() => {
    if (!srcToken || !dstToken || !order) return;
    return getOrderExecutionRate(order.srcAmountFilled, order.dstAmountFilled, srcToken.decimals, dstToken.decimals);
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

export const useGetOrderFilterText = () => {
  const t = useTranslations();

  return useCallback(
    (filter?: OrderFilter) => {
      if (!filter) return t("allOrders");
      switch (filter) {
        case OrderFilter.Open:
          return t("Open");
        case OrderFilter.Completed:
          return t("Completed");
        case OrderFilter.Expired:
          return t("Expired");
        case OrderFilter.Canceled:
          return t("Canceled");
        default:
          return t("allOrders");
      }
    },
    [t],
  );
};

const useOrderFilters = () => {
  const getOrderFilterText = useGetOrderFilterText();
  return useMemo(() => {
    return Object.values(OrderFilter).map((it) => {
      return {
        text: getOrderFilterText(it),
        value: it,
      };
    });
  }, [getOrderFilterText]);
};





export const useOrderHistoryPanel = () => {
  const {
    data: orders,
    isLoading: orderLoading,
    refetch,
    isRefetching,
  } = useOrdersQuery();
  const { mutateAsync: cancelOrder, isPending: isCancelOrderLoading } =
    useCancelOrderMutation();
  const selectedOrderID = useSpotStore((s) => s.state.selectedOrderID);

  const updateState = useSpotStore((s) => s.updateState);
  const selectedOrderFilter = useSpotStore(
    (s) => s.state.orderHistoryStatusFilter,
  );
  const isDisplayingOrderFills = useSpotStore(
    (s) => s.state.showSelectedOrderFills,
  );

  const onSelectOrderFilter = useCallback(
    (orderHistoryStatusFilter: OrderFilter) =>
      updateState({ orderHistoryStatusFilter }),
    [],
  );

  const orderFilters = useOrderFilters();
  const selectedOrders = useOrderToDisplay();

  const selectedOrder = useSelectedOrder(selectedOrderID);
  const openOrders = useMemo(
    () => filterAndSortOrders(orders, OrderFilter.Open),
    [orders],
  );

  const onDisplayOrder = useCallback(
    (id?: string) => {
      if (!id) {
        updateState({
          selectedOrderID: undefined,
          showSelectedOrderFills: false,
        });
      } else {
        updateState({ selectedOrderID: id });
      }
    },
    [updateState],
  );

  const refetchOrders = useCallback(
    () => refetch().then((it) => it.data),
    [refetch],
  );

  const onCancelOrder = useCallback(
    async (order: Order) => {
      return cancelOrder({ orders: [order] }).then((it) => it?.[0] || "");
    },
    [cancelOrder],
  );

  const onCancelAllOpenOrders = useCallback(
    () => cancelOrder({ orders: openOrders }),
    [cancelOrder, orders],
  );

  const onHideOrderFills = useCallback(
    () => updateState({ showSelectedOrderFills: false }),
    [updateState],
  );
  
  const selectedFilter = useMemo(() => {
    const value = selectedOrderFilter || orderFilters[0]!.value as OrderFilter;
    return orderFilters.find((item) => item.value === value)!;
  }, [orderFilters, selectedOrderFilter]);

  return {
    refetchOrders,
    onCancelOrder,
    onSelectOrderFilter,
    onDisplayOrder,
    onCancelAllOpenOrders,
    onHideOrderFills,
    isRefetching,
    allOrders: orders ?? [],
    selectedOrders,
    isDisplayingOrderFills,
    isLoading: orderLoading,
    selectedOrder: selectedOrderID ? selectedOrder : undefined,
    openOrdersCount: openOrders?.length || 0,
    isCancelOrderLoading,
    selectedOrderFilter: selectedFilter,
    orderFilters,
  };
};

import {
  getOrderFillDelayMillis,
  getAccountOrders,
  Order,
  OrderStatus,
  OrderType,
  getOrderExecutionRate,
  getOrderLimitPriceRate,
  getTriggerPriceRate,
} from "@orbs-network/spot-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { REFETCH_ORDER_HISTORY } from "../consts";
import { useSpotContext } from "../spot-context";
import { Token } from "../types";
import { useSpotStore } from "../store";
import { Module } from "@orbs-network/spot-ui";

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

const useOrdersQueryKey = () => {
  const { account, config, chainId, isDev } = useSpotContext();
  return useMemo(
    () => [
      "useTwapOrderHistoryManager",
      account,
      config?.adapter,
      chainId,
      isDev,
    ],
    [account, config, chainId, isDev],
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
  const { callbacks } = useSpotContext();
  const queryClient = useQueryClient();
  const queryKey = useOrdersQueryKey();
  return useCallback(
    (orders: Order[]) => {
      const prevOrders = queryClient.getQueryData(queryKey) as Order[];
      let isProgressUpdated = false;
      const updatedOrders: Order[] = [];

      if (prevOrders) {
        prevOrders
          .filter((o) => o.version === 2)
          .forEach((prevOrder) => {
            const currentOrder = orders.find((o) => o.id === prevOrder.id);

            if (!currentOrder) return;

            if (currentOrder.progress !== prevOrder.progress) {
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
      }
    },
    [queryClient, queryKey, callbacks],
  );
};

export const useOrdersQuery = () => {
  const { account, config, chainId, isDev } = useSpotContext();

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
        isDev,
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
    return getTriggerPriceRate(order, srcToken.decimals, dstToken.decimals);
  }, [order, srcToken, dstToken]);
};

export const useOrderAvgExecutionPrice = (
  srcToken?: Token,
  dstToken?: Token,
  order?: Order,
) => {
  return useMemo(() => {
    if (!srcToken || !dstToken || !order) return;
    return getOrderExecutionRate(
      order.srcAmountFilled,
      order.dstAmountFilled,
      srcToken.decimals,
      dstToken.decimals,
    );
  }, [order, srcToken, dstToken]);
};

const filterAndSortOrders = (orders: Order[], filter: OrderStatus): Order[] => {
  const filtered = orders.filter((o) => o.status === filter);
  return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
};
export const useOrderHistoryPanel = () => {
  const { data: orders, isLoading, refetch, isRefetching } = useOrdersQuery();

  const refetchOrders = useCallback(
    () => refetch().then((it) => it.data),
    [refetch],
  );

  return useMemo(() => {
    return {
      orders: {
        all: orders ?? [],
        open: filterAndSortOrders(orders ?? [], OrderStatus.Open),
        completed:
          filterAndSortOrders(orders ?? [], OrderStatus.Completed),
        cancelled:
          filterAndSortOrders(orders ?? [], OrderStatus.Cancelled),
        expired: filterAndSortOrders(orders ?? [], OrderStatus.Expired),
      },
      isLoading,
      isRefetching,
      refetchOrders,
    };
  }, [orders, isLoading, isRefetching, refetchOrders]);
};

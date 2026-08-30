import {
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
import { useRePermitData } from "./use-repermit-data";

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
      return isMarketOrder ? OrderType.TAKE_PROFIT_MARKET : OrderType.TAKE_PROFIT_LIMIT;
    }
    return OrderType.TWAP_MARKET;
  }, [module, isMarketOrder]);
};

const buildOrdersQueryKey = (
  account: string | undefined,
  exchange: string | undefined,
  partner: string,
  chainId: number,
  isDev: boolean | undefined,
  supportLegacyOrders: boolean,
) => [
  "useTwapOrderHistoryManager",
  account,
  exchange,
  partner,
  chainId,
  isDev,
  supportLegacyOrders,
];

const useOrdersQueryKey = () => {
  const { account, partner, chainId, isDev, supportLegacyOrders } =
    useSpotContext();
  const { data: permitData } = useRePermitData();
  const exchange = permitData?.order.witness.exchange.adapter;
  return useMemo(
    () =>
      buildOrdersQueryKey(
        account,
        exchange,
        partner,
        chainId,
        isDev,
        supportLegacyOrders,
      ),
    [account, exchange, partner, chainId, isDev, supportLegacyOrders],
  );
};

const useOrdersWithoutConfigQueryKey = () => {
  const { account, partner, chainId, isDev, supportLegacyOrders } =
    useSpotContext();
  return useMemo(
    () =>
      buildOrdersQueryKey(
        account,
        undefined,
        partner,
        chainId,
        isDev,
        supportLegacyOrders,
      ),
    [account, partner, chainId, isDev, supportLegacyOrders],
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

export const useUpdateCachedOrderStatus = () => {
  const queryClient = useQueryClient();
  const queryKey = useOrdersQueryKey();

  return useCallback(
    (orderId: string, status: OrderStatus) => {
      queryClient.setQueryData<Order[]>(queryKey, (orders) =>
        orders?.map((order) =>
          order.id === orderId ? { ...order, status } : order,
        ),
      );
    },
    [queryClient, queryKey],
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

const mergeCachedV1Orders = (
  orders: Order[],
  cachedOrders?: Order[],
): Order[] => {
  const orderIds = new Set(orders.map((order) => order.id));
  const cachedV1Orders =
    cachedOrders?.filter(
      (order) => order.version === 1 && !orderIds.has(order.id),
    ) ?? [];

  return [...orders, ...cachedV1Orders].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
};

export const useOrdersQuery = () => {
  const { account, partner, chainId, isDev, supportLegacyOrders } =
    useSpotContext();
  const { data: permitData } = useRePermitData();
  const queryClient = useQueryClient();

  const queryKey = useOrdersQueryKey();
  const ordersWithoutConfigQueryKey = useOrdersWithoutConfigQueryKey();
  const orderFilledCallback = useOrderFilledCallback();
  const query = useQuery<Order[]>({
    refetchInterval: REFETCH_ORDER_HISTORY,
    refetchOnWindowFocus: true,
    retry: false,
    gcTime: Infinity,
    staleTime: Infinity,
    queryKey,
    enabled: Boolean(account && chainId),
    queryFn: async ({ signal }) => {
      if (!account || !chainId) return [];
      const cachedOrders =
        queryClient.getQueryData<Order[]>(queryKey) ??
        queryClient.getQueryData<Order[]>(ordersWithoutConfigQueryKey);
      const legacyOrders = supportLegacyOrders && !cachedOrders;
      const orders = await getAccountOrders({
        signal,
        chainId,
        exchange: permitData?.order.witness.exchange.adapter,
        partner,
        account,
        isDev,
        legacyOrders,
      });

      orderFilledCallback(orders);
      if (!supportLegacyOrders || legacyOrders) {
        return orders;
      }

      return mergeCachedV1Orders(orders, cachedOrders);
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

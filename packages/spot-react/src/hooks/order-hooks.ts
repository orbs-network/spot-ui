import { OrderStatus, type Order } from "@orbs-network/spot-ui";
import { useMemo, useCallback, useEffect } from "react";
import type {
  OrdersLoader,
  OrdersResourceState,
} from "../context/create-spot-store";
import { useSpotRuntime } from "../context/spot-runtime-context";
import {
  useSpotStore,
  useSpotStoreApi,
} from "../context/spot-store-context";
import { useClient } from "../context/use-client";
import {
  categorizeOrders,
  mergeCachedLegacyOrders,
  notifyOrderUpdates,
  type CategorizedOrders,
} from "../order-history-data";

export type { CategorizedOrders } from "../order-history-data";

const EMPTY_ORDERS_RESULT: OrdersResourceState = { isFetching: false };

/**
 * Connects the provider store to the account/client-specific history source.
 * This configures fetching but does not start polling; useOrders owns the
 * mounted-consumer subscription that activates it.
 */
export const useOrdersResource = () => {
  const { account, partner, chainId, supportLegacyOrders, callbacks } =
    useSpotRuntime();
  const { data: client } = useClient();
  const store = useSpotStoreApi();
  const enabled = Boolean(account && client);
  const key = enabled
    ? JSON.stringify([
        account,
        client?.exchangeAddress,
        partner,
        chainId,
        supportLegacyOrders,
      ])
    : undefined;
  const loader = useCallback<OrdersLoader>(
    async (previousOrders, legacyLoaded, signal) => {
      if (!account || !client) {
        return { orders: [], legacyLoaded: false };
      }
      const loadLegacyOrders = supportLegacyOrders && !legacyLoaded;
      const orders = await client.getAccountOrders({
        signal,
        account,
        legacyOrders: loadLegacyOrders,
      });
      notifyOrderUpdates(previousOrders, orders, callbacks);
      return {
        orders:
          supportLegacyOrders && !loadLegacyOrders
            ? mergeCachedLegacyOrders(orders, previousOrders)
            : orders,
        legacyLoaded: legacyLoaded || loadLegacyOrders,
      };
    },
    [account, callbacks, client, supportLegacyOrders],
  );

  useEffect(() => {
    store.getState().configureOrders(key, enabled ? loader : undefined);
  }, [enabled, key, loader, store]);

  const refetch = useCallback(() => {
    if (!enabled || !key) return Promise.resolve(undefined);
    const state = store.getState();
    state.configureOrders(key, loader);
    return state.refetchOrders(true);
  }, [enabled, key, loader, store]);

  return { enabled, key, refetch };
};

/** Cache commands used by order creation and cancellation flows. */
export const useAddNewOrder = () => {
  // Configure the correct account history key even when no history UI is
  // mounted, so the optimistic order cannot enter another account's cache.
  useOrdersResource();
  const store = useSpotStoreApi();
  return useCallback(
    (order: Order) => store.getState().addOrder(order),
    [store],
  );
};

export const useUpdateCachedOrderStatus = () => {
  const store = useSpotStoreApi();
  return useCallback(
    (historyKey: string, status: OrderStatus) =>
      store.getState().updateOrderStatus(historyKey, status),
    [store],
  );
};

export const useRefetchActiveOrders = () => {
  const store = useSpotStoreApi();
  return useCallback(
    () => store.getState().refetchOrders(),
    [store],
  );
};

export interface OrdersResult {
  data?: CategorizedOrders;
  error?: Error;
  isLoading: boolean;
  isFetching: boolean;
  isRefetching: boolean;
  refetch: () => Promise<CategorizedOrders | undefined>;
}

/**
 * Public order-history hook. Multiple callers share one provider-owned cache,
 * in-flight request, and polling timer. Polling exists only while at least one
 * caller is mounted.
 */
export const useOrders = (): OrdersResult => {
  const ordersState = useSpotStore((state) => state.orders);
  const registerConsumer = useSpotStore(
    (state) => state.registerOrdersConsumer,
  );
  const { enabled, key, refetch: refetchRaw } = useOrdersResource();
  const currentState =
    ordersState.key === key ? ordersState : EMPTY_ORDERS_RESULT;

  useEffect(() => {
    const unregisterConsumer = registerConsumer();
    return unregisterConsumer;
  }, [registerConsumer]);

  const data = useMemo(
    () =>
      currentState.data === undefined
        ? undefined
        : categorizeOrders(currentState.data),
    [currentState.data],
  );
  const refetch = useCallback(async () => {
    const orders = await refetchRaw();
    return orders === undefined ? undefined : categorizeOrders(orders);
  }, [refetchRaw]);

  return useMemo(
    () => ({
      data,
      error: currentState.error,
      isLoading:
        enabled && data === undefined && currentState.error === undefined,
      isFetching: currentState.isFetching,
      isRefetching: currentState.isFetching && data !== undefined,
      refetch,
    }),
    [currentState, data, enabled, refetch],
  );
};

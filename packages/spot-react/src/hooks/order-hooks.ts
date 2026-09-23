import type { Order, SpotClient } from "@orbs-network/spot-ui";
import { useMemo, useCallback, useEffect } from "react";
import type {
  OrdersLoader,
  OrdersResourceState,
} from "../context/create-spot-store";
import { useSpotTrading } from "../context/spot-trading-context";
import {
  useSpotStore,
  useSpotStoreApi,
} from "../context/spot-store-context";
import { useClient } from "../context/use-client";
import {
  categorizeOrders,
  loadOrderHistory,
  type CategorizedOrders,
} from "../order-history-data";

export type { CategorizedOrders } from "../order-history-data";

const EMPTY_ORDERS_RESULT: OrdersResourceState = { isFetching: false };

const getOrdersResourceKey = (
  account: string | undefined,
  client: SpotClient | undefined,
  supportLegacyOrders: boolean,
): string | undefined =>
  account && client
    ? JSON.stringify([
        account, client.exchangeAddress, client.partner, client.chainId,
        supportLegacyOrders,
      ])
    : undefined;

/**
 * Connects the provider store to the account/client-specific history source.
 * This configures fetching but does not start polling; useOrders owns the
 * mounted-consumer subscription that activates it.
 */
export const useConfigureOrdersResource = (): void => {
  const { account, supportLegacyOrders, callbacks } =
    useSpotTrading();
  const { data: client } = useClient();
  const store = useSpotStoreApi();
  const key = getOrdersResourceKey(account, client, supportLegacyOrders);
  const enabled = Boolean(key);
  const loader = useCallback<OrdersLoader>(
    async (previousOrders, legacyLoaded, signal) => {
      if (!account || !client) {
        return { orders: [], legacyLoaded: false };
      }
      return loadOrderHistory({
        client, account, signal, supportLegacyOrders,
        previousOrders, legacyLoaded, callbacks,
      });
    },
    [account, callbacks, client, supportLegacyOrders],
  );

  useEffect(() => {
    store.getState().configureOrders(key, enabled ? loader : undefined);
  }, [enabled, key, loader, store]);
};

export const useOrdersResource = () => {
  const { account, supportLegacyOrders } = useSpotTrading();
  const { data: client } = useClient();
  const store = useSpotStoreApi();
  const key = getOrdersResourceKey(account, client, supportLegacyOrders);
  const enabled = Boolean(key);
  const refetch = useCallback((refreshLegacy = false) => {
    if (!enabled || !key || store.getState().orders.key !== key) {
      return Promise.resolve(undefined);
    }
    return store.getState().refetchOrders(true, refreshLegacy);
  }, [enabled, key, store]);
  return { enabled, key, refetch };
};

/** Cache commands used by order creation and cancellation flows. */
export const useAddNewOrder = () => {
  const store = useSpotStoreApi();
  return useCallback(
    (order: Order) => store.getState().addOrder(order),
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

import { useCallback, useEffect, useMemo } from "react";
import type { OrdersResourceState } from "./resource";
import { useOrdersResource } from "./resource-hooks";

import { useSpotStore } from "../store/store-context";
import { categorizeOrders, type CategorizedOrders } from "./selectors";

export type { CategorizedOrders } from "./selectors";

const EMPTY_ORDERS_RESULT: OrdersResourceState = { isFetching: false };

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

import type { Order, SpotClient } from "@orbs-network/spot-ui";
import { useCallback, useEffect } from "react";
import { loadOrderHistory } from "./load-history";
import type { OrdersLoader } from "./resource";

import { useClient } from "../client/use-client";
import { useSpotTrading } from "../provider/trading-context";
import { useSpotStoreApi } from "../store/store-context";

const getOrdersResourceKey = (
  account: string | undefined,
  client: SpotClient | undefined,
  supportLegacyOrders: boolean,
): string | undefined =>
  account && client
    ? JSON.stringify([
        account,
        client.exchangeAddress,
        client.partner,
        client.chainId,
        supportLegacyOrders,
      ])
    : undefined;

/**
 * Connects the provider store to the account/client-specific history source.
 * This configures fetching but does not start polling; useOrders owns the
 * mounted-consumer subscription that activates it.
 */
export const useConfigureOrdersResource = (): void => {
  const { account, supportLegacyOrders, callbacks } = useSpotTrading();
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
        client,
        account,
        signal,
        supportLegacyOrders,
        previousOrders,
        legacyLoaded,
        callbacks,
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
  const refetch = useCallback(
    (refreshLegacy = false) => {
      if (!enabled || !key || store.getState().orders.key !== key) {
        return Promise.resolve(undefined);
      }
      return store.getState().refetchOrders(true, refreshLegacy);
    },
    [enabled, key, store],
  );
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
  return useCallback(() => store.getState().refetchOrders(), [store]);
};

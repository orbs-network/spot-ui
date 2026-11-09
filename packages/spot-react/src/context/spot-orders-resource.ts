import type { StoreApi } from "zustand/vanilla";
import type { Order } from "@orbs-network/spot-ui";
import type { Callbacks } from "../types";
import type { SpotStore, OrdersLoader, OrdersResourceState } from "./create-spot-store";
import { REFETCH_ORDER_HISTORY } from "../consts";
import {
  mergeOrderSnapshots,
  notifyOrderUpdates,
  structurallyShareOrders,
} from "../order-history-data";

export const EMPTY_ORDERS_STATE: OrdersResourceState = { isFetching: false };

type OrdersResourceActions = Pick<
  SpotStore,
  | "configureOrders"
  | "registerOrdersConsumer"
  | "refetchOrders"
  | "addOrder"
  | "updateOrder"
>;

/** One history resource shares requests, polling, and notifications across consumers. */
export const createOrdersResource = (
  set: StoreApi<SpotStore>["setState"],
  get: StoreApi<SpotStore>["getState"],
): OrdersResourceActions => {
  let ordersKey: string | undefined;
  let ordersLoader: OrdersLoader | undefined;
  let ordersCallbacks: Callbacks | undefined;
  const notifiedFilledOrders = new Set<string>();
  let ordersLegacyLoaded = false;
  let ordersConsumers = 0;
  let ordersRequestId = 0;
  let ordersPromise: Promise<Order[] | undefined> | undefined;
  let ordersAbortController: AbortController | undefined;
  let ordersInterval: ReturnType<typeof setInterval> | undefined;

  const commitOrders = (
    orders: Order[],
    callbacks = ordersCallbacks,
    isFetching = get().orders.isFetching,
    trackedOrder?: Order,
  ): Order[] => {
    const key = ordersKey;
    const previousOrders = get().orders.data;
    const sharedOrders = structurallyShareOrders(
      previousOrders,
      mergeOrderSnapshots(previousOrders, orders),
    );
    set((store) => ({ orders: { ...store.orders, data: sharedOrders, isFetching } }));
    // Store subscribers may switch accounts synchronously after the commit.
    if (ordersKey === key) {
      notifyOrderUpdates(previousOrders, sharedOrders, callbacks, notifiedFilledOrders, trackedOrder);
    }
    return sharedOrders;
  };

  const refetchOrders = async (
    force = false,
    refreshLegacy = false,
  ): Promise<Order[] | undefined> => {
    if ((!force && ordersConsumers === 0) || !ordersKey || !ordersLoader) {
      return get().orders.data;
    }
    if (ordersPromise) {
      if (!refreshLegacy) return ordersPromise;
      const key = ordersKey;
      await ordersPromise;
      if (ordersKey !== key) return undefined;
      return refetchOrders(force, refreshLegacy);
    }

    const requestId = ++ordersRequestId;
    const load = ordersLoader;
    const previousOrders = get().orders.data;
    const abortController = new AbortController();
    ordersAbortController = abortController;
    set((store) => ({
      orders: {
        key: ordersKey,
        data: store.orders.data,
        error: undefined,
        isFetching: true,
      },
    }));

    const promise = load(
      previousOrders,
      refreshLegacy ? false : ordersLegacyLoaded,
      abortController.signal,
    )
      .then(({ orders, legacyLoaded }) => {
        if (requestId !== ordersRequestId) return undefined;
        ordersLegacyLoaded = legacyLoaded;
        return commitOrders(orders, ordersCallbacks, false);
      })
      .catch((error: unknown) => {
        if (requestId !== ordersRequestId || abortController.signal.aborted) {
          return undefined;
        }
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        set((store) => ({
          orders: {
            key: ordersKey,
            data: store.orders.data,
            error: normalizedError,
            isFetching: false,
          },
        }));
        return undefined;
      });

    ordersPromise = promise;
    void promise.finally(() => {
      if (ordersPromise === promise) ordersPromise = undefined;
      if (ordersAbortController === abortController) {
        ordersAbortController = undefined;
      }
    });
    return promise;
  };

  const refetchOrdersOnFocus = (): void => {
    void refetchOrders();
  };

  const stopOrders = (): void => {
    if (ordersInterval) {
      clearInterval(ordersInterval);
      ordersInterval = undefined;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", refetchOrdersOnFocus);
    }
    ordersAbortController?.abort();
    ordersAbortController = undefined;
    ordersPromise = undefined;
    ordersRequestId++;
    set((store) => ({
      orders: { ...store.orders, isFetching: false },
    }));
  };

  const startOrders = (): void => {
    if (!ordersKey || !ordersLoader || ordersInterval) return;
    void refetchOrders(true);
    ordersInterval = setInterval(() => {
      void refetchOrders();
    }, REFETCH_ORDER_HISTORY);
    if (typeof window !== "undefined") {
      window.addEventListener("focus", refetchOrdersOnFocus);
    }
  };

  return {
    configureOrders: (key, loader, callbacks) => {
      ordersCallbacks = callbacks;
      if (ordersKey === key) {
        ordersLoader = loader;
        return;
      }
      stopOrders();
      ordersKey = key;
      ordersLoader = loader;
      ordersLegacyLoaded = false;
      notifiedFilledOrders.clear();
      set({
        orders: key ? { key, isFetching: false } : EMPTY_ORDERS_STATE,
      });
      if (ordersConsumers > 0) startOrders();
    },
    registerOrdersConsumer: () => {
      // Any number of useOrders callers share the same request and timer.
      // Only the first mount starts polling and only the last cleanup stops it.
      ordersConsumers++;
      if (ordersConsumers === 1) startOrders();
      return () => {
        ordersConsumers = Math.max(0, ordersConsumers - 1);
        if (ordersConsumers === 0) stopOrders();
      };
    },
    refetchOrders,
    addOrder: (order) => {
      set((store) => {
        const orders = store.orders.data;
        if (
          orders?.some(
            (candidate) => candidate.historyKey === order.historyKey,
          )
        ) {
          return store;
        }
        return {
          orders: {
            ...store.orders,
            data: [order, ...(orders ?? [])],
          },
        };
      });
    },
    updateOrder: (order, callbacks) => {
      const previousOrders = get().orders.data ?? [];
      const exists = previousOrders.some(candidate => candidate.historyKey === order.historyKey);
      const nextOrders = exists
        ? previousOrders.map(candidate => candidate.historyKey === order.historyKey ? order : candidate)
        : [order, ...previousOrders];
      commitOrders(nextOrders, ordersCallbacks ?? callbacks, get().orders.isFetching, order);
    },
  };
};

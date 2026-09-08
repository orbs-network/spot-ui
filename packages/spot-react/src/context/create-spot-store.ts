import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  SpotProps,
  State,
  StartedSwapExecution,
  SwapExecution,
} from "../types";
import { ExecutionPhase } from "../types";
import { Module, type Order, type SpotClient } from "@orbs-network/spot-ui";
import {
  canBeginExecution,
  canTransitionExecution,
  createIdleExecution,
  isExecutionActive,
} from "../execution-state";
import { REFETCH_ORDER_HISTORY } from "../consts";
import { structurallyShareOrders } from "../order-history-data";

export interface SpotFormDefaults {
  tradeCount?: number;
  tradeInterval?: State["tradeInterval"];
  orderDuration?: State["orderDuration"];
  limitPriceUi?: string;
  triggerPriceUi?: string;
  triggerPricePercent?: string | null;
  limitPricePercent?: string | null;
  isMarketOrder?: boolean;
}

export interface ClientResourceState {
  key?: string;
  data?: SpotClient;
  error?: Error;
  isFetching: boolean;
}

export interface OrdersResourceState {
  key?: string;
  data?: Order[];
  error?: Error;
  isFetching: boolean;
}

type ClientLoader = () => Promise<SpotClient>;

export interface OrdersLoadResult {
  orders: Order[];
  legacyLoaded: boolean;
}

export type OrdersLoader = (
  previousOrders: Order[] | undefined,
  legacyLoaded: boolean,
  signal: AbortSignal,
) => Promise<OrdersLoadResult>;

export interface SpotStore {
  client: ClientResourceState;
  orders: OrdersResourceState;
  configureClient: (key?: string, loader?: ClientLoader) => void;
  refetchClient: () => Promise<SpotClient | undefined>;
  configureOrders: (key?: string, loader?: OrdersLoader) => void;
  registerOrdersConsumer: () => () => void;
  refetchOrders: (force?: boolean) => Promise<Order[] | undefined>;
  addOrder: (order: Order) => void;
  updateOrderStatus: (historyKey: string, status: Order["status"]) => void;
  beginExecution: (
    value: Omit<SwapExecution, "executionId" | "phase">,
  ) => StartedSwapExecution | undefined;
  replaceExecution: (
    executionId: number,
    value: SwapExecution,
  ) => boolean;
  syncFormDefaults: (defaults: SpotFormDefaults) => boolean;
  startNewOrder: (defaults: SpotFormDefaults) => boolean;
  returnToOrderForm: () => boolean;
  updateState: (value: Partial<State>) => void;
  state: State;
}

const createFormState = (defaults: SpotFormDefaults): Pick<
  State,
  | "tradeCount"
  | "tradeInterval"
  | "orderDuration"
  | "limitPriceUi"
  | "triggerPriceUi"
  | "triggerPricePercent"
  | "limitPricePercent"
  | "isMarketOrder"
  | "isPriceInverted"
> => ({
  tradeCount: defaults.tradeCount,
  tradeInterval: defaults.tradeInterval,
  orderDuration: defaults.orderDuration,
  limitPriceUi: defaults.limitPriceUi,
  triggerPriceUi: defaults.triggerPriceUi,
  triggerPricePercent: defaults.triggerPricePercent,
  limitPricePercent: defaults.limitPricePercent,
  isMarketOrder: defaults.isMarketOrder,
  isPriceInverted: undefined,
});

const createInitialState = (defaults: SpotFormDefaults): State => ({
  ...createFormState(defaults),
  cancelOrders: {},
  currentExecution: createIdleExecution(),
});

const EMPTY_CLIENT_STATE: ClientResourceState = { isFetching: false };
const EMPTY_ORDERS_STATE: OrdersResourceState = { isFetching: false };

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const createSpotStore = (
  initialState: SpotFormDefaults,
): StoreApi<SpotStore> => {
  let nextExecutionId = 0;
  let clientKey: string | undefined;
  let clientLoader: ClientLoader | undefined;
  let clientRequestId = 0;
  let clientPromise: Promise<SpotClient | undefined> | undefined;
  let ordersKey: string | undefined;
  let ordersLoader: OrdersLoader | undefined;
  let ordersLegacyLoaded = false;
  let ordersConsumers = 0;
  let ordersRequestId = 0;
  let ordersPromise: Promise<Order[] | undefined> | undefined;
  let ordersAbortController: AbortController | undefined;
  let ordersInterval: ReturnType<typeof setInterval> | undefined;

  return createStore<SpotStore>((set, get) => {
    const refetchClient = async (): Promise<SpotClient | undefined> => {
      if (!clientKey || !clientLoader) return undefined;
      if (clientPromise) return clientPromise;

      const requestId = ++clientRequestId;
      const load = clientLoader;
      set((store) => ({
        client: {
          key: clientKey,
          data: store.client.data,
          error: undefined,
          isFetching: true,
        },
      }));

      const promise = (async () => {
        let lastError: Error | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (requestId !== clientRequestId) return undefined;
          try {
            const client = await load();
            if (requestId !== clientRequestId) return undefined;
            set({
              client: { key: clientKey, data: client, isFetching: false },
            });
            return client;
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error));
            if (requestId !== clientRequestId) return undefined;
            if (attempt < 2) await wait(2 ** attempt * 1_000);
          }
        }

        if (requestId === clientRequestId) {
          set({
            client: { key: clientKey, error: lastError, isFetching: false },
          });
        }
        return undefined;
      })();

      clientPromise = promise;
      void promise.finally(() => {
        if (clientPromise === promise) clientPromise = undefined;
      });
      return promise;
    };

    const refetchOrders = async (
      force = false,
    ): Promise<Order[] | undefined> => {
      if ((!force && ordersConsumers === 0) || !ordersKey || !ordersLoader) {
        return get().orders.data;
      }
      if (ordersPromise) return ordersPromise;

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
        ordersLegacyLoaded,
        abortController.signal,
      )
        .then(({ orders, legacyLoaded }) => {
          if (requestId !== ordersRequestId) return undefined;
          ordersLegacyLoaded = legacyLoaded;
          const sharedOrders = structurallyShareOrders(
            get().orders.data,
            orders,
          );
          set({
            orders: {
              key: ordersKey,
              data: sharedOrders,
              isFetching: false,
            },
          });
          return sharedOrders;
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
      client: EMPTY_CLIENT_STATE,
      orders: EMPTY_ORDERS_STATE,
      state: createInitialState(initialState),
      configureClient: (key, loader) => {
        if (clientKey === key) {
          clientLoader = loader;
          return;
        }
        clientKey = key;
        clientLoader = loader;
        clientRequestId++;
        clientPromise = undefined;
        set({
          client: key ? { key, isFetching: false } : EMPTY_CLIENT_STATE,
        });
        if (key && loader) void refetchClient();
      },
      refetchClient,
      configureOrders: (key, loader) => {
        if (ordersKey === key) {
          ordersLoader = loader;
          return;
        }
        stopOrders();
        ordersKey = key;
        ordersLoader = loader;
        ordersLegacyLoaded = false;
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
      updateOrderStatus: (historyKey, status) => {
        set((store) => ({
          orders: {
            ...store.orders,
            data: store.orders.data?.map((order) =>
              order.historyKey === historyKey ? { ...order, status } : order,
            ),
          },
        }));
      },
      updateState: (value: Partial<State>) =>
        set((store) => ({ state: { ...store.state, ...value } })),
      beginExecution: (value) => {
        let startedExecution: StartedSwapExecution | undefined;
        set((store) => {
          if (!canBeginExecution(store.state.currentExecution.phase)) {
            return store;
          }
          startedExecution = {
            ...value,
            executionId: ++nextExecutionId,
            phase: ExecutionPhase.PREPARING,
          };
          return {
            state: {
              ...store.state,
              currentExecution: startedExecution,
            },
          };
        });
        return startedExecution;
      },
      replaceExecution: (executionId, value) => {
        let replaced = false;
        set((store) => {
          const current = store.state.currentExecution;
          if (
            current.executionId !== executionId ||
            value.executionId !== executionId ||
            !canTransitionExecution(current.phase, value.phase)
          ) {
            return store;
          }
          replaced = true;
          return {
            state: { ...store.state, currentExecution: value },
          };
        });
        return replaced;
      },
      returnToOrderForm: () => {
        const current = get().state.currentExecution;
        if (
          isExecutionActive(current.phase) ||
          current.phase === ExecutionPhase.SUCCESS
        ) {
          return false;
        }
        set((store) => ({
          state: {
            ...store.state,
            currentExecution: createIdleExecution(current.completedWrap),
          },
        }));
        return true;
      },
      syncFormDefaults: (defaults) => {
        if (isExecutionActive(get().state.currentExecution.phase)) {
          return false;
        }
        set((store) => ({
          state: {
            ...store.state,
            ...createFormState(defaults),
            currentExecution: createIdleExecution(),
          },
        }));
        return true;
      },
      startNewOrder: (defaults) => {
        const { state: previousState } = get();
        if (isExecutionActive(previousState.currentExecution.phase)) {
          return false;
        }
        set((store) => ({
          state: {
            ...store.state,
            ...createFormState(defaults),
            isMarketOrder: previousState.isMarketOrder,
            currentExecution: createIdleExecution(),
          },
        }));
        return true;
      },
    };
  });
};

export const createSpotFormDefaults = (
  props: Pick<SpotProps, "module" | "overrides">,
): SpotFormDefaults => {
  const state = props.overrides?.state;
  return {
    isMarketOrder: props.module === Module.LIMIT ? false : state?.isMarketOrder,
    tradeCount: state?.tradeCount,
    tradeInterval: state?.tradeInterval,
    orderDuration: state?.orderDuration,
    limitPriceUi: state?.limitPriceUi,
    triggerPriceUi: state?.triggerPriceUi,
    triggerPricePercent: state?.triggerPricePercent,
    limitPricePercent: state?.limitPricePercent,
  };
};

import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  Callbacks,
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
  isExecutionLocked,
} from "../execution-state";
import { createClientResource, EMPTY_CLIENT_STATE } from "./spot-client-resource";
import { createOrdersResource, EMPTY_ORDERS_STATE } from "./spot-orders-resource";

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

export type ClientLoader = () => Promise<SpotClient>;

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
  configureOrders: (key?: string, loader?: OrdersLoader, callbacks?: Callbacks) => void;
  registerOrdersConsumer: () => () => void;
  refetchOrders: (
    force?: boolean,
    refreshLegacy?: boolean,
  ) => Promise<Order[] | undefined>;
  addOrder: (order: Order) => void;
  updateOrder: (order: Order, callbacks?: Callbacks) => void;
  setCancelOrder: (historyKey: string, value: State["cancelOrders"][string]) => void;
  clearCancelOrder: (historyKey: string) => void;
  beginExecution: (
    value: Omit<SwapExecution, "executionId" | "phase">,
  ) => StartedSwapExecution | undefined;
  replaceExecution: (
    executionId: number,
    value: SwapExecution,
  ) => boolean;
  acquireExecutionController: () => AbortController | undefined;
  releaseExecutionController: (controller: AbortController) => void;
  abortExecutionTask: (preserveSubmitted?: boolean) => void;
  syncFormDefaults: (defaults: SpotFormDefaults) => boolean;
  startNewOrder: (defaults: SpotFormDefaults, executionId: number | undefined) => boolean;
  returnToOrderForm: (executionId: number | undefined) => boolean;
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

export const createSpotStore = (
  initialState: SpotFormDefaults,
): StoreApi<SpotStore> => {
  let nextExecutionId = 0;
  let executionController: AbortController | undefined;

  return createStore<SpotStore>((set, get) => {
    const clientResource = createClientResource(set);
    const ordersResource = createOrdersResource(set, get);

    return {
      client: EMPTY_CLIENT_STATE,
      orders: EMPTY_ORDERS_STATE,
      state: createInitialState(initialState),
      ...clientResource,
      ...ordersResource,
      setCancelOrder: (historyKey, value) => {
        set((store) => ({
          state: {
            ...store.state,
            cancelOrders: { ...store.state.cancelOrders, [historyKey]: value },
          },
        }));
      },
      clearCancelOrder: (historyKey) => {
        set((store) => {
          if (!(historyKey in store.state.cancelOrders)) return store;
          const cancelOrders = { ...store.state.cancelOrders };
          delete cancelOrders[historyKey];
          return { state: { ...store.state, cancelOrders } };
        });
      },
      updateState: (value: Partial<State>) =>
        set((store) => ({ state: { ...store.state, ...value } })),
      acquireExecutionController: () => {
        if (executionController) return undefined;
        executionController = new AbortController();
        return executionController;
      },
      releaseExecutionController: (controller) => {
        if (executionController === controller) executionController = undefined;
      },
      abortExecutionTask: (preserveSubmitted = false) => {
        const phase = get().state.currentExecution.phase;
        const submissionStarted =
          phase === ExecutionPhase.SUBMITTING ||
          phase === ExecutionPhase.SETTLING ||
          phase === ExecutionPhase.UNCONFIRMED;
        if (preserveSubmitted && submissionStarted) return;
        executionController?.abort();
      },
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
      returnToOrderForm: (executionId) => {
        const current = get().state.currentExecution;
        if (
          current.executionId !== executionId ||
          isExecutionLocked(current.phase) ||
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
        if (isExecutionLocked(get().state.currentExecution.phase)) {
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
      startNewOrder: (defaults, executionId) => {
        const { state: previousState } = get();
        if (
          previousState.currentExecution.executionId !== executionId ||
          isExecutionLocked(previousState.currentExecution.phase)
        ) {
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
    isMarketOrder: props.module === Module.LIMIT || props.module === Module.SWAP
      ? false
      : state?.isMarketOrder,
    tradeCount: state?.tradeCount,
    tradeInterval: state?.tradeInterval,
    orderDuration: state?.orderDuration,
    limitPriceUi: state?.limitPriceUi,
    triggerPriceUi: state?.triggerPriceUi,
    triggerPricePercent: state?.triggerPricePercent,
    limitPricePercent: state?.limitPricePercent,
  };
};

import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  Callbacks,
  AdvancedOrdersProviderProps,
  State,
  StartedOrderExecutionState,
  OrderExecutionState,
} from "../types";
import { ExecutionPhase } from "../types";
import { OrderType, type Order, type SpotClient } from "@orbs-network/spot-ui";
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
    value: Omit<OrderExecutionState, "executionId" | "phase">,
  ) => StartedOrderExecutionState | undefined;
  replaceExecution: (
    executionId: number,
    value: OrderExecutionState,
  ) => boolean;
  getExecution: (executionId: number) => OrderExecutionState | undefined;
  getBackgroundExecutions: () => OrderExecutionState[];
  finishExecution: (executionId: number) => void;
  queueWrapTransaction: <T>(scope: string, action: () => Promise<T>) => Promise<T>;
  acquireExecutionController: (executionId?: number) => AbortController | undefined;
  releaseExecutionController: (controller: AbortController) => void;
  abortExecutionTask: (preserveSubmitted?: boolean, reason?: unknown) => void;
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
  const executionControllers = new Map<AbortController, { executionId?: number }>();
  const backgroundExecutions = new Map<number, OrderExecutionState>();
  const wrapTransactions = new Map<string, Promise<void>>();

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
      getExecution: (executionId) => {
        const current = get().state.currentExecution;
        return current.executionId === executionId
          ? current
          : backgroundExecutions.get(executionId);
      },
      getBackgroundExecutions: () => [...backgroundExecutions.values()],
      finishExecution: (executionId) => {
        if (backgroundExecutions.get(executionId)?.phase !== ExecutionPhase.UNCONFIRMED) {
          if (backgroundExecutions.delete(executionId)) set(store => ({ ...store }));
        }
      },
      queueWrapTransaction: (scope, action) => {
        const previous = wrapTransactions.get(scope) ?? Promise.resolve();
        const result = previous.then(action);
        const completed = result.then(() => undefined, () => undefined);
        wrapTransactions.set(scope, completed);
        void completed.then(() => {
          if (wrapTransactions.get(scope) === completed) wrapTransactions.delete(scope);
        });
        return result;
      },
      acquireExecutionController: (executionId) => {
        const isForeground = executionId === undefined ||
          get().state.currentExecution.executionId === executionId;
        if (isForeground && executionController) return undefined;
        if (executionId !== undefined && !isForeground && (!backgroundExecutions.has(executionId) ||
          [...executionControllers.values()].some(task => task.executionId === executionId))) {
          return undefined;
        }
        const controller = new AbortController();
        executionControllers.set(controller, { executionId });
        if (isForeground) executionController = controller;
        return controller;
      },
      releaseExecutionController: (controller) => {
        executionControllers.delete(controller);
        if (executionController === controller) executionController = undefined;
      },
      abortExecutionTask: (preserveSubmitted = false, reason) => {
        for (const [controller, task] of executionControllers) {
          const phase = task.executionId === undefined
            ? get().state.currentExecution.phase
            : get().getExecution(task.executionId)?.phase;
          const submissionStarted =
            phase === ExecutionPhase.SUBMITTING ||
            phase === ExecutionPhase.SETTLING ||
            phase === ExecutionPhase.UNCONFIRMED;
          if (!preserveSubmitted || !submissionStarted) controller.abort(reason);
        }
      },
      beginExecution: (value) => {
        let startedExecution: StartedOrderExecutionState | undefined;
        set((store) => {
          if (!canBeginExecution(store.state.currentExecution.phase)) {
            return store;
          }
          startedExecution = {
            ...value,
            executionId: ++nextExecutionId,
            phase: ExecutionPhase.PREPARING,
          };
          const task = executionController && executionControllers.get(executionController);
          if (task) task.executionId = startedExecution.executionId;
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
        const background = backgroundExecutions.get(executionId);
        if (background) {
          if (value.executionId !== executionId || !canTransitionExecution(background.phase, value.phase)) {
            return false;
          }
          backgroundExecutions.set(executionId, value);
          // Background snapshots are kept outside the editable form state.
          // Publish a new store snapshot so selectors can observe their status.
          set(store => ({ ...store }));
          return true;
        }
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
            currentExecution: createIdleExecution(),
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
        if (previousState.currentExecution.executionId !== executionId) {
          return false;
        }
        if (executionId !== undefined && isExecutionLocked(previousState.currentExecution.phase)) {
          backgroundExecutions.set(executionId, previousState.currentExecution);
        }
        executionController = undefined;
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
  props: Pick<AdvancedOrdersProviderProps, "orderType" | "overrides">,
): SpotFormDefaults => {
  const state = props.overrides?.state;
  return {
    isMarketOrder: props.orderType === OrderType.LIMIT
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

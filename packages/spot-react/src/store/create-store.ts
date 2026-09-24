import {
  createExecutionController,
  createIdleExecution,
  isExecutionActive,
} from "@orbs-network/spot-ui";
import { createStore, type StoreApi } from "zustand/vanilla";
import { createClientResource } from "../client/resource";
import { createFormState } from "../form/state";
import type { FormDefaults } from "../form/types";
import { createHistoryResource } from "../history/resource";
import type { SpotStore, State } from "./types";

export function createSpotStore(defaults: FormDefaults): StoreApi<SpotStore> {
  return createStore<SpotStore>((set, get) => {
    const updateState = (value: Partial<State>): void =>
      set(({ state }) => ({ state: { ...state, ...value } }));

    const execution = createExecutionController({
      get: () => get().state.currentExecution,
      set: (currentExecution) => updateState({ currentExecution }),
    });

    const resetForm = (defaults: FormDefaults): boolean => {
      if (isExecutionActive(get().state.currentExecution.phase)) return false;
      updateState({
        ...createFormState(defaults),
        currentExecution: createIdleExecution(),
      });
      return true;
    };

    return {
      state: {
        ...createFormState(defaults),
        cancelOrders: {},
        currentExecution: createIdleExecution(),
      },
      ...createClientResource(set),
      ...createHistoryResource(set, get),
      updateState,
      beginExecution: execution.beginExecution,
      replaceExecution: execution.replaceExecution,
      returnToOrderForm: execution.returnToOrderForm,
      syncFormDefaults: resetForm,
      startNewOrder: (defaults) =>
        resetForm({ ...defaults, isMarketOrder: get().state.isMarketOrder }),
      setCancelOrder: (historyKey, value) => {
        updateState({
          cancelOrders: { ...get().state.cancelOrders, [historyKey]: value },
        });
      },
      clearCancelOrder: (historyKey) => {
        const current = get().state.cancelOrders;
        if (!(historyKey in current)) return;
        const cancelOrders = { ...current };
        delete cancelOrders[historyKey];
        updateState({ cancelOrders });
      },
    };
  });
}

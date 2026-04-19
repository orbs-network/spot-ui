import { create } from "zustand";
import { State, SwapExecution } from "./types";

interface SpotStore {
  resetState: () => void;
  updateState: (value: Partial<State>) => void;
  resetSwapExecutionAtIndex: () => void;
  updateSwapExecutionAtIndex: (
    index: number,
    value: Partial<SwapExecution>,
  ) => void;
  state: State;
}

const emptySwapExecution = {} as SwapExecution;

const initialState: State = {
  currentTime: Date.now(),
  cancelOrders: {},
  swapExecutions: [emptySwapExecution],
  swapExecutionIndex: 0,
};

export const useSpotStore = create<SpotStore>((set, get) => ({
  state: initialState,
  updateState: (value: Partial<State>) =>
    set((state) => ({ state: { ...state.state, ...value } })),
  updateSwapExecutionAtIndex: (index: number, data: Partial<SwapExecution>) =>
    set((state) => {
      const executions = [...state.state.swapExecutions];
      executions[index] = {
        ...(executions[index] ?? emptySwapExecution),
        ...data,
      };
      return { state: { ...state.state, swapExecutions: executions } };
    }),
  resetSwapExecutionAtIndex: () =>
    set((state) => {
      const executions = [...state.state.swapExecutions];
      executions[state.state.swapExecutionIndex] = emptySwapExecution;
      return { state: { ...state.state, swapExecutions: executions } };
    }),
  resetState: () => {
    const prev = get().state;
    set({
      state: {
        ...initialState,
        currentTime: Date.now(),
        isMarketOrder: prev.isMarketOrder,
        swapExecutions: [...prev.swapExecutions, emptySwapExecution],
        swapExecutionIndex: prev.swapExecutionIndex + 1,
      },
    });
  },
}));

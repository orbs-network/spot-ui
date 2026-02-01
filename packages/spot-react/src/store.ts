import { create } from "zustand";
import { State, SwapExecution } from "./types";


interface SpotStore {
  resetState: () => void;
  updateState: (value: Partial<State>) => void;
  updateSwapExecution: (value: Partial<SwapExecution>) => void;
  state: State;
}

const initialState = {
  disclaimerAccepted: true,
  currentTime: Date.now(),
  swapExecution: {} as SwapExecution,
} as State;

export const useSpotStore = create<SpotStore>((set, get) => ({
  state: initialState,
  updateState: (value: Partial<State>) => set((state) => ({ state: { ...state.state, ...value } })),
  updateSwapExecution: (data: Partial<SwapExecution>) => set((state) => ({ state: { ...state.state, swapExecution: { ...state.state.swapExecution, ...data } } })),
  resetState: () => {
    set({
      state: {
        ...initialState,
        currentTime: Date.now(),
        swapExecution: get().state.swapExecution,
        isMarketOrder: get().state.isMarketOrder,
      },
    });
  },
}));

import { useCallback, useMemo } from "react";
import { useSpotStore } from "../store";
import { SwapExecution } from "../types";

// Stable empty reference so an unseeded slot doesn't return a fresh object on
// every selector call (which would trigger an infinite re-render loop).
const EMPTY_SWAP_EXECUTION = {} as SwapExecution;

export const useSwapExecution = () => {
  const index = useSpotStore((s) => s.state.swapExecutionIndex);
  const current = useSpotStore(
    (s) => s.state.swapExecutions[s.state.swapExecutionIndex] ?? EMPTY_SWAP_EXECUTION,
  ) as SwapExecution;
  const updateAtIndex = useSpotStore((s) => s.updateSwapExecutionAtIndex);
  const resetSwap = useSpotStore((s) => s.resetSwapExecutionAtIndex);
  const update = useCallback(
    (data: Partial<SwapExecution>) => updateAtIndex(index, data),
    [updateAtIndex, index],
  );

  return useMemo(() => ({ ...current, update, resetSwap }), [current, update, resetSwap]);
};

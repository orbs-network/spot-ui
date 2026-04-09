import { useCallback, useMemo } from "react";
import { useSpotStore } from "../store";
import { SwapExecution } from "../types";

export const useSwapExecution = () => {
  const index = useSpotStore((s) => s.state.swapExecutionIndex);
  const current = useSpotStore(
    (s) => s.state.swapExecutions[s.state.swapExecutionIndex] ?? {},
  ) as SwapExecution;
  const updateAtIndex = useSpotStore((s) => s.updateSwapExecutionAtIndex);
  const resetSwap = useSpotStore((s) => s.resetSwapExecutionAtIndex);
  const update = useCallback(
    (data: Partial<SwapExecution>) => updateAtIndex(index, data),
    [updateAtIndex, index],
  );

  return useMemo(() => ({ ...current, update, resetSwap }), [current, update, resetSwap]);
};

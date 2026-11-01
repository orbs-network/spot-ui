import { useCallback, useMemo } from "react";
import { useSpotStore } from "../context/spot-store-context";

export const useSwapExecution = () => {
  const current = useSpotStore((store) => store.state.currentExecution);
  const resetOrderState = useSpotStore(
    (store) => store.returnToOrderForm,
  );
  const returnToOrderForm = useCallback(
    () => resetOrderState(current.executionId),
    [current.executionId, resetOrderState],
  );

  return useMemo(
    () => ({ ...current, returnToOrderForm }),
    [current, returnToOrderForm],
  );
};

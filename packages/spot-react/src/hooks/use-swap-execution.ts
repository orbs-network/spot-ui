import { useMemo } from "react";
import { useSpotStore } from "../context/spot-store-context";

export const useSwapExecution = () => {
  const current = useSpotStore((store) => store.state.currentExecution);
  const returnToOrderForm = useSpotStore(
    (store) => store.returnToOrderForm,
  );

  return useMemo(
    () => ({ ...current, returnToOrderForm }),
    [current, returnToOrderForm],
  );
};

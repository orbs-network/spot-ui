import { useCallback } from "react";
import { checkOrderStatus } from "../check-order-status";
import { useSpotStoreApi } from "../context/spot-store-context";
import { useSpotTrading } from "../context/spot-trading-context";

/** Status recovery does not depend on the currently connected wallet or network. */
export const useCheckOrderStatus = (): (() => void) => {
  const store = useSpotStoreApi();
  const { callbacks } = useSpotTrading();
  return useCallback(() => {
    void checkOrderStatus({ store, callbacks }).catch(() => undefined);
  }, [callbacks, store]);
};

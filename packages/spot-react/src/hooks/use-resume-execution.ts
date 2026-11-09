import { useCallback } from "react";
import { resumeExecution } from "../resume-execution";
import { useSpotStoreApi } from "../context/spot-store-context";
import { useSpotTrading } from "../context/spot-trading-context";

/** Status recovery does not depend on the currently connected wallet or network. */
export const useResumeExecution = (): (() => void) => {
  const store = useSpotStoreApi();
  const { callbacks, disableAnalytics } = useSpotTrading();
  return useCallback(() => {
    const controller = store.getState().acquireExecutionController();
    if (!controller) return;
    void resumeExecution({ store, callbacks, signal: controller.signal, disableAnalytics })
      .catch(() => undefined)
      .finally(() => {
        store.getState().releaseExecutionController(controller);
      });
  }, [callbacks, disableAnalytics, store]);
};

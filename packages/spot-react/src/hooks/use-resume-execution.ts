import { useCallback, useEffect, useRef } from "react";
import { resumeExecution } from "../resume-execution";
import { useSpotStoreApi } from "../context/spot-store-context";
import { useSpotTrading } from "../context/spot-trading-context";

/** Status recovery does not depend on the currently connected wallet or network. */
export const useResumeExecution = (): (() => void) => {
  const store = useSpotStoreApi();
  const { callbacks } = useSpotTrading();
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => active.current?.abort(), []);
  return useCallback(() => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    void resumeExecution({ store, callbacks, signal: controller.signal })
      .catch(() => undefined)
      .finally(() => {
        if (active.current === controller) active.current = undefined;
      });
  }, [callbacks, store]);
};

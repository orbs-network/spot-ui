import { useEffect, useRef, type ReactNode } from "react";
import { isExecutionActive } from "../execution-state";
import {
  useSpotStore,
  useSpotStoreApi,
  type SpotFormDefaults,
} from "./spot-store";

/**
 * Applies defaults when the partner, chain, module, or token pair changes.
 * The provider store itself remains mounted, so client/history resources and
 * cancellation state are not discarded. A change during execution is deferred
 * until the frozen order reaches a terminal phase.
 */
export const SpotFormSynchronizer = ({
  children,
  defaults,
  scopeKey,
}: {
  children: ReactNode;
  defaults: SpotFormDefaults;
  scopeKey: string;
}) => {
  const store = useSpotStoreApi();
  const phase = useSpotStore(
    (currentStore) => currentStore.state.currentExecution.phase,
  );
  const appliedScopeKey = useRef(scopeKey);

  useEffect(() => {
    if (appliedScopeKey.current === scopeKey || isExecutionActive(phase)) {
      return;
    }
    if (store.getState().syncFormDefaults(defaults)) {
      appliedScopeKey.current = scopeKey;
    }
  }, [defaults, phase, scopeKey, store]);

  return children;
};

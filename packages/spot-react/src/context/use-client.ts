import { createClient, type SpotAnalytics, type SpotClient } from "@orbs-network/spot-ui";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ClientResourceState } from "./create-spot-store";
import { useSpotTrading } from "./spot-trading-context";
import { useSpotStore, useSpotStoreApi } from "./spot-store-context";
import { observe } from "../execution-state";
import { createOperationAnalytics } from "../analytics";

const getClientKey = (partner: string, chainId: number | undefined, disableAnalytics: boolean): string =>
  `${partner}:${chainId}:${disableAnalytics ? "telemetry-off" : "telemetry-on"}`;

export interface ClientResult {
  data?: SpotClient;
  error?: Error;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<SpotClient | undefined>;
}

const EMPTY_CLIENT_RESULT: ClientResourceState = { isFetching: false };

/** Mounted once by SpotResources. Public consumers only read this resource. */
export const useConfigureClient = (): void => {
  const { partner, chainId, hasChainId, disableAnalytics } = useSpotTrading();
  const store = useSpotStoreApi();
  const analyticsPolicyRef = useRef<SpotAnalytics | undefined>(undefined);
  if (!analyticsPolicyRef.current) {
    analyticsPolicyRef.current = createOperationAnalytics({}, undefined, disableAnalytics);
  }
  const analyticsPolicy = analyticsPolicyRef.current;
  const enabled = Boolean(chainId && hasChainId);
  const key = enabled ? getClientKey(partner, chainId, disableAnalytics) : undefined;
  const loader = useCallback(() => {
    if (!chainId) {
      return Promise.reject(
        new Error("Spot is unavailable on the connected chain"),
      );
    }
    // All client scopes share one opt-out policy, including pending configuration
    // and cancellations that finish after the provider changes account or chain.
    return createClient(partner, chainId, { disableAnalytics, analytics: analyticsPolicy });
  }, [chainId, partner, disableAnalytics, analyticsPolicy]);

  useEffect(() => {
    // Apply suppression before reconfiguration starts another client request.
    observe(() => analyticsPolicy.setDisabled(disableAnalytics));
    const state = store.getState();
    observe(() => state.state.currentExecution.analytics?.setDisabled(disableAnalytics));
  }, [analyticsPolicy, disableAnalytics, store]);

  useEffect(() => {
    store
      .getState()
      .configureClient(key, enabled ? loader : undefined);
  }, [enabled, key, loader, store]);
};

export const useClient = (): ClientResult => {
  const { partner, chainId, hasChainId, disableAnalytics } = useSpotTrading();
  const store = useSpotStoreApi();
  const clientState = useSpotStore((state) => state.client);
  const enabled = Boolean(chainId && hasChainId);
  const key = enabled ? getClientKey(partner, chainId, disableAnalytics) : undefined;
  const currentState =
    clientState.key === key ? clientState : EMPTY_CLIENT_RESULT;

  const refetch = useCallback(() => {
    if (!enabled || !key) return Promise.resolve(undefined);
    const state = store.getState();
    if (state.client.key !== key) return Promise.resolve(undefined);
    return state.refetchClient();
  }, [enabled, key, store]);

  return useMemo(
    () => ({
      data: currentState.data,
      error: currentState.error,
      isLoading:
        enabled && !currentState.data && currentState.error === undefined,
      isFetching: currentState.isFetching,
      refetch,
    }),
    [currentState, enabled, refetch],
  );
};

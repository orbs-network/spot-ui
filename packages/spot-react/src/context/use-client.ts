import { createClient, type SpotClient } from "@orbs-network/spot-ui";
import { useCallback, useEffect, useMemo } from "react";
import {
  useSpotRuntime,
  useSpotStore,
  useSpotStoreApi,
  type ClientResourceState,
} from "./spot-store";

export interface ClientResult {
  data?: SpotClient;
  error?: Error;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<SpotClient | undefined>;
}

const EMPTY_CLIENT_RESULT: ClientResourceState = { isFetching: false };

export const useClient = (): ClientResult => {
  const { partner, chainId, isSupportedChain } = useSpotRuntime();
  const store = useSpotStoreApi();
  const clientState = useSpotStore((state) => state.client);
  const enabled = Boolean(chainId && isSupportedChain);
  const key = enabled ? `${partner}:${chainId}` : undefined;
  const currentState =
    clientState.key === key ? clientState : EMPTY_CLIENT_RESULT;
  const loader = useCallback(() => {
    if (!chainId) {
      return Promise.reject(
        new Error("Spot is unavailable on the connected chain"),
      );
    }
    return createClient(partner, chainId);
  }, [chainId, partner]);

  useEffect(() => {
    store
      .getState()
      .configureClient(key, enabled ? loader : undefined);
  }, [enabled, key, loader, store]);

  const refetch = useCallback(() => {
    if (!enabled || !key) return Promise.resolve(undefined);
    const state = store.getState();
    state.configureClient(key, loader);
    return state.refetchClient();
  }, [enabled, key, loader, store]);

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

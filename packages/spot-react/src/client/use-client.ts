import { type SpotClient } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useSpotTrading } from "../provider/trading-context";
import { useSpotStore, useSpotStoreApi } from "../store/store-context";
import type { ClientResourceState } from "./resource";

export interface ClientResult {
  data?: SpotClient;
  error?: Error;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<SpotClient | undefined>;
}

const EMPTY_CLIENT_RESULT: ClientResourceState = { isFetching: false };

export const useClient = (): ClientResult => {
  const { partner, chainId, hasChainId } = useSpotTrading();
  const store = useSpotStoreApi();
  const clientState = useSpotStore((state) => state.client);
  const enabled = Boolean(chainId && hasChainId);
  const key = enabled ? `${partner}:${chainId}` : undefined;
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

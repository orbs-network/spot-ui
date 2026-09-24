import { createClient } from "@orbs-network/spot-ui";
import { useCallback, useEffect } from "react";
import pkg from "../../package.json";
import { useSpotTrading } from "../provider/trading-context";
import { useSpotStoreApi } from "../store/store-context";

/** Mounted once by SpotResources. Public consumers only read this resource. */
export const useConfigureClient = (): void => {
  const { partner, chainId, hasChainId } = useSpotTrading();
  const store = useSpotStoreApi();
  const enabled = Boolean(chainId && hasChainId);
  const key = enabled ? `${partner}:${chainId}` : undefined;
  const loader = useCallback(() => {
    if (!chainId) {
      return Promise.reject(
        new Error("Spot is unavailable on the connected chain"),
      );
    }
    return createClient(partner, chainId, { uiVersion: pkg.version });
  }, [chainId, partner]);

  useEffect(() => {
    store.getState().configureClient(key, enabled ? loader : undefined);
  }, [enabled, key, loader, store]);
};

import { analytics, getTwapConfig } from "@orbs-network/spot-ui";
import {
  useCallback,
  useEffect,
  type ComponentType,
  type ReactNode,
} from "react";
import type { ClientErrorFallbackProps } from "../types";
import { useClient } from "./use-client";
import { useSpotRuntime } from "./spot-store";

const DefaultClientErrorFallback = ({
  error,
  retry,
  isRetrying,
}: ClientErrorFallbackProps) => (
  <div className="spot-client-error-fallback" role="alert">
    <p>{error.message || "Unable to load Spot configuration."}</p>
    <button
      type="button"
      className="spot-client-error-retry"
      disabled={isRetrying}
      onClick={retry}
    >
      {isRetrying ? "Retrying…" : "Retry"}
    </button>
  </div>
);

export const ClientErrorNotice = ({
  children,
  fallback: ClientErrorFallback = DefaultClientErrorFallback,
}: {
  children: ReactNode;
  fallback?: ComponentType<ClientErrorFallbackProps>;
}) => {
  const { partner, chainId, isSupportedChain, minTradeSizeUsd } =
    useSpotRuntime();
  const { data: client, error, isFetching, refetch } = useClient();
  const retry = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);

  useEffect(() => {
    if (!client || !chainId || !isSupportedChain) return;
    analytics.onFetchedConfig(
      client.rePermitData,
      partner,
      getTwapConfig(partner, chainId),
      minTradeSizeUsd,
    );
  }, [chainId, client, isSupportedChain, minTradeSizeUsd, partner]);

  return (
    <>
      {children}
      {!client && error && isSupportedChain ? (
        <ClientErrorFallback
          error={error}
          retry={retry}
          isRetrying={isFetching}
        />
      ) : null}
    </>
  );
};

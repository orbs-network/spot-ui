import { useCallback, type ComponentType, type ReactNode } from "react";
import { useSpotTrading } from "../provider/trading-context";
import type { ClientErrorFallbackProps } from "../provider/types";
import { useClient } from "./use-client";

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
  const { hasChainId } = useSpotTrading();
  const { data: client, error, isFetching, refetch } = useClient();
  const retry = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);

  return (
    <>
      {children}
      {!client && error && hasChainId ? (
        <ClientErrorFallback
          error={error}
          retry={retry}
          isRetrying={isFetching}
        />
      ) : null}
    </>
  );
};

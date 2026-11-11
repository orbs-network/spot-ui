import {
  useCallback,
  type ComponentType,
  type ReactNode,
} from "react";
import type { SpotErrorFallbackProps } from "../types";
import { useClient } from "./use-client";
import { useSpotTrading } from "./spot-trading-context";
import { DefaultErrorFallback } from "./default-error-fallback";

export const ClientErrorNotice = ({
  children,
  fallback: ErrorFallback = DefaultErrorFallback,
}: {
  children: ReactNode;
  fallback?: ComponentType<SpotErrorFallbackProps>;
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
        <ErrorFallback
          error={error}
          retry={retry}
          isRetrying={isFetching}
        />
      ) : null}
    </>
  );
};

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  analytics,
  fetchRePermitData,
  getPartnerChains,
  getTwapConfig,
} from "@orbs-network/spot-ui";
import { useSpotContext } from "../spot-context";

export const useRePermitData = () => {
  const { partner, chainId, isDev = false, minChunkSizeUsd } =
    useSpotContext();
  const { data, error, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["repermit-data", partner, chainId, isDev],
    queryFn: () => {
      if (!getPartnerChains(partner).includes(chainId)) {
        throw new Error(
          `Partner "${partner}" is not supported on chain ${chainId}`,
        );
      }
      return fetchRePermitData(partner, chainId, isDev);
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });
  const loading = isLoading || isFetching;

  useEffect(() => {
    if (!data) return;
    analytics.onFetchedConfig(
      data,
      partner,
      getTwapConfig(partner, chainId),
      minChunkSizeUsd,
      isDev,
    );
  }, [chainId, data, isDev, minChunkSizeUsd, partner]);

  return useMemo(
    () => ({ data, error, isLoading: loading, refetch }),
    [data, error, loading, refetch],
  );
};

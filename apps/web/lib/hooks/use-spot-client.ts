"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createClient, type Partners, type SpotClient } from "@orbs-network/spot-react";
import { DEFAULT_PARTNER } from "../consts";
import { useActiveChainId } from "./use-active-chain-id";
import { useSwapParams } from "./use-swap-params";

/**
 * Shares a host client for the selected partner and active chain outside SpotProvider.
 * `data` is undefined while configuration loads; use `error` and `refetch` for failures.
 * Analytics are disabled here because SpotProvider owns execution analytics.
 */
export const useSpotClient = (): Pick<
  UseQueryResult<SpotClient>, "data" | "error" | "isLoading" | "refetch"
> & {
  chainId: number;
  partner: Partners;
} => {
  const chainId = useActiveChainId();
  const { parsedPartner } = useSwapParams();
  const partner = parsedPartner ?? DEFAULT_PARTNER;

  const query = useQuery({
    queryKey: ["spot-client", partner, chainId],
    queryFn: () => createClient(partner, chainId, { disableAnalytics: true }),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    enabled: Number.isSafeInteger(chainId) && chainId > 0,
  });

  return {
    chainId,
    partner,
    data: query.data,
    error: query.error,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
};

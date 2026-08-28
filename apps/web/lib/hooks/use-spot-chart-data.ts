import { useQuery } from "@tanstack/react-query";
import {
  getCurrentPairPrice,
  getHistoricalPairPrices,
} from "../get-usd-price";

export type SpotChartLiveStatus = "connecting" | "live" | "delayed";

export function useSpotChartData({
  sourceToken,
  destinationToken,
  chainId,
}: {
  sourceToken?: string;
  destinationToken?: string;
  chainId?: number;
}) {
  const enabled = Boolean(sourceToken && destinationToken && chainId);

  const historyQuery = useQuery({
    queryKey: [
      "spot-chart-history",
      chainId,
      sourceToken?.toLowerCase(),
      destinationToken?.toLowerCase(),
    ],
    queryFn: ({ signal }) =>
      getHistoricalPairPrices(
        sourceToken!,
        destinationToken!,
        chainId!,
        signal,
      ),
    enabled,
    staleTime: 5 * 60 * 1_000,
    refetchInterval: 5 * 60 * 1_000,
    retry: 1,
  });

  const currentPriceQuery = useQuery({
    queryKey: [
      "spot-chart-current-price",
      chainId,
      sourceToken?.toLowerCase(),
      destinationToken?.toLowerCase(),
    ],
    queryFn: ({ signal }) =>
      getCurrentPairPrice(
        sourceToken!,
        destinationToken!,
        chainId!,
        signal,
      ),
    enabled,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const liveStatus: SpotChartLiveStatus | undefined = !enabled
    ? undefined
    : currentPriceQuery.isPending
      ? "connecting"
      : currentPriceQuery.isError || !currentPriceQuery.data
        ? "delayed"
        : "live";

  return {
    ...historyQuery,
    livePrice: currentPriceQuery.data?.value,
    liveTimestamp: currentPriceQuery.data?.time,
    liveStatus,
  };
}

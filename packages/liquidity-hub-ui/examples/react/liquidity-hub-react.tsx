"use client";

import {
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  DEFAULT_QUOTE_INTERVAL,
  type LiquidityHubSDK,
  type Quote,
} from "@orbs-network/liquidity-hub-sdk";
import {
  createLiquidityHubSDK,
  executeLiquidityHubSwap,
  liquidityHubKeys,
  shouldRetryLiquidityHubQuote,
  type LiquidityHubQuoteParams,
  type LiquidityHubSwapResult,
  type LiquidityHubSwapVariables,
  type WalletAdapter,
} from "./liquidity-hub";

export function LiquidityHubQueryProvider({
  children,
}: PropsWithChildren): React.JSX.Element {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

export function useLiquidityHub(chainId?: number): LiquidityHubSDK | null {
  return useMemo(
    () => (chainId ? createLiquidityHubSDK(chainId) : null),
    [chainId],
  );
}

export interface LiquidityHubQuoteResult {
  sdk: LiquidityHubSDK | null;
  quote: Quote | null;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  getLatestQuote: () => Promise<Quote>;
}

export function useLiquidityHubQuote(
  params: LiquidityHubQuoteParams,
): LiquidityHubQuoteResult {
  const {
    chainId,
    account,
    fromToken,
    toToken,
    inAmount,
    dexMinAmountOut,
    slippage,
    disabled = false,
  } = params;
  const sdk = useLiquidityHub(chainId);
  const canFetch = Boolean(
    !disabled &&
      sdk &&
      account &&
      fromToken &&
      toToken &&
      inAmount &&
      inAmount !== "0",
  );

  const query = useQuery<Quote, Error>({
    queryKey: liquidityHubKeys.quote({
      chainId: chainId ?? null,
      account: account?.toLowerCase() ?? null,
      fromToken: fromToken?.toLowerCase() ?? null,
      toToken: toToken?.toLowerCase() ?? null,
      inAmount,
      dexMinAmountOut: dexMinAmountOut ?? null,
      slippage,
    }),
    queryFn: ({ signal }): Promise<Quote> => {
      if (!sdk || !account || !fromToken || !toToken) {
        throw new Error("The quote parameters are incomplete");
      }

      return sdk.getQuote({
        fromToken,
        toToken,
        inAmount,
        dexMinAmountOut,
        account,
        slippage,
        signal,
      });
    },
    enabled: canFetch,
    retry: shouldRetryLiquidityHubQuote,
    staleTime: DEFAULT_QUOTE_INTERVAL,
    gcTime: 60_000,
    refetchInterval: DEFAULT_QUOTE_INTERVAL,
    refetchOnWindowFocus: false,
  });

  const { data, error, isFetching, isLoading, refetch } = query;

  const getLatestQuote = useCallback(async (): Promise<Quote> => {
    if (!canFetch) {
      throw new Error("The quote parameters are incomplete");
    }

    const result = await refetch({
      cancelRefetch: true,
      throwOnError: true,
    });

    if (!result.data) throw new Error("Liquidity Hub quote is unavailable");
    return result.data;
  }, [canFetch, refetch]);

  return {
    sdk,
    quote: canFetch ? (data ?? null) : null,
    error,
    isLoading,
    isFetching,
    getLatestQuote,
  };
}

interface UseLiquidityHubSwapParams {
  sdk: LiquidityHubSDK | null;
  wallet: WalletAdapter;
  getLatestQuote: () => Promise<Quote>;
}

export function useLiquidityHubSwap({
  sdk,
  wallet,
  getLatestQuote,
}: UseLiquidityHubSwapParams): UseMutationResult<
  LiquidityHubSwapResult,
  Error,
  LiquidityHubSwapVariables
> {
  return useMutation<
    LiquidityHubSwapResult,
    Error,
    LiquidityHubSwapVariables
  >({
    mutationKey: ["liquidity-hub", "swap"],
    scope: { id: "liquidity-hub-swap" },
    retry: false,
    mutationFn: (variables) => {
      if (!sdk) return Promise.reject(new Error("Liquidity Hub is not ready"));

      return executeLiquidityHubSwap({
        sdk,
        wallet,
        getLatestQuote,
        ...variables,
      });
    },
  });
}

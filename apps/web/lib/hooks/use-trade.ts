import { skipToken, useQuery } from "@tanstack/react-query";
import { useSpotClient } from "./use-spot-client";
import { useSettings } from "./use-settings";
import type { BestTradeQuote, Currency } from "../types";

import BN from "bignumber.js";
import {
  getWrappedNativeCurrency,
  isNativeAddress,
} from "../utils";
import { useConnection } from "wagmi";
import { useSwapStore } from "./store";

export const SWAP_QUOTE_QUERY_KEY = ["spot-swap-quote"] as const;

export const useTrade = (
  inputCurrency?: Currency,
  outputCurrency?: Currency,
  parsedInputAmount = "",
  disabled = false,
) => {
  const {
    chainId, partner, data: client, isLoading: isClientLoading,
    error: clientError, refetch: refetchClient,
  } = useSpotClient();
  const { slippage } = useSettings();
  const { pauseQuote } = useSwapStore();
  const { address: account } = useConnection();
  const inToken = inputCurrency?.address ?? "";
  const outToken = outputCurrency?.address ?? "";
  const user = account ?? "0x0000000000000000000000000000000000000001";
  const canQuote = !!inToken && !!outToken && BN(parsedInputAmount).gt(0) &&
    !!chainId && !disabled && !pauseQuote;
  const query = useQuery<BestTradeQuote>({
    queryKey: [...SWAP_QUOTE_QUERY_KEY, chainId, partner, inToken, outToken, parsedInputAmount, user, slippage],
    queryFn: client
      ? async ({ signal }) => {
          const quote = await client.getQuote({
            inToken: isNativeAddress(inToken)
              ? getWrappedNativeCurrency(chainId)?.address ?? ""
              : inToken,
            outToken,
            inAmount: parsedInputAmount,
            user,
            slippage,
            dexMinAmountOut: "-1",
            signal,
          });
          return {
            outAmount: quote.netAmountOut,
            minAmountOut: quote.minimumAmountOut,
            inToken,
            outToken,
            inAmount: parsedInputAmount,
            gas: "0",
            originalQuote: quote,
          };
        }
      : skipToken,
    refetchInterval: pauseQuote ? false : 10_000,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: canQuote && !!client,
  });

  const error = canQuote ? (client ? query.error : clientError) : null;
  return {
    data: !disabled && client && !query.error ? query.data : undefined,
    error,
    isLoading: canQuote && (isClientLoading || query.isLoading),
    // A successful client retry enables the quote query on the next render.
    refetch: () => {
      if (!disabled && !useSwapStore.getState().pauseQuote) {
        return client ? query.refetch() : refetchClient();
      }
    },
  };
};

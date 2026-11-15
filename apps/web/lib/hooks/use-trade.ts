import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getSwapSlippage, getTokenUsd, type GetTokenUsdParams } from "@orbs-network/spot-react";
import { useSpotClient } from "./use-spot-client";
import { useSettings } from "./use-settings";
import type { BestTradeQuote, Currency } from "../types";
import { Field } from "../types";

import BN from "bignumber.js";
import {
  getWrappedNativeCurrency,
  isNativeAddress,
} from "../utils";
import { useConnection } from "wagmi";
import { useSwapStore } from "./store";
import { useSwapParams } from "./use-swap-params";

export const SWAP_QUOTE_QUERY_KEY = ["spot-swap-quote"] as const;
const QUOTE_REFRESH_MILLIS = 10_000;
const OUTPUT_AMOUNT_DEBOUNCE_MILLIS = 250;
const PRICE_WAIT_MILLIS = 1_500;
const TOKEN_USD_CACHE_SECONDS = 30;

const getQuoteTokenUsd = async ({
  signal,
  ...params
}: GetTokenUsdParams & { signal: AbortSignal }): Promise<string | undefined> => {
  signal.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), PRICE_WAIT_MILLIS);
  try {
    return await getTokenUsd({ ...params, signal: controller.signal });
  } catch {
    signal.throwIfAborted();
    return undefined;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onAbort);
  }
};

export const useTrade = (
  inputCurrency?: Currency,
  outputCurrency?: Currency,
  parsedAmount = "",
  disabled = false,
  amountField = Field.INPUT,
) => {
  const {
    chainId, partner, data: client, isLoading: isClientLoading,
    error: clientError, refetch: refetchClient,
  } = useSpotClient();
  const { slippage, isCustomSlippage } = useSettings();
  const { apiUrl } = useSwapParams();
  const { pauseQuote } = useSwapStore();
  const { address: account } = useConnection();
  const inToken = inputCurrency?.address ?? "";
  const outToken = outputCurrency?.address ?? "";
  const user = account ?? "0x0000000000000000000000000000000000000001";
  const quoteInToken = isNativeAddress(inToken)
    ? getWrappedNativeCurrency(chainId)?.address ?? ""
    : inToken;
  const isOutputAmount = amountField === Field.OUTPUT;
  const slippageToken = isOutputAmount ? outToken : quoteInToken;
  const slippageTokenAddress = isNativeAddress(slippageToken)
    ? getWrappedNativeCurrency(chainId)?.address ?? "" : slippageToken;
  const typedDecimals = isOutputAmount ? outputCurrency?.decimals : inputCurrency?.decimals;
  useEffect(() => {
    if (!slippageTokenAddress || isCustomSlippage || disabled || !Number.isSafeInteger(chainId) || chainId <= 0) return;
    const controller = new AbortController();
    void getTokenUsd({
      tokenAddress: slippageTokenAddress, chainId, cacheSeconds: TOKEN_USD_CACHE_SECONDS, signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, [chainId, slippageTokenAddress, isCustomSlippage, disabled]);
  const quoteScopeKey = [...SWAP_QUOTE_QUERY_KEY, {
    chainId, partner, apiUrl,
    inToken: quoteInToken.toLowerCase(), outToken: outToken.toLowerCase(),
    inDecimals: inputCurrency?.decimals, outDecimals: outputCurrency?.decimals,
    user: user.toLowerCase(), slippage, isCustomSlippage,
  }] as const;
  const [debouncedAmount, setDebouncedAmount] = useState(parsedAmount);
  useEffect(() => {
    if (!isOutputAmount) return;
    const timer = setTimeout(() => setDebouncedAmount(parsedAmount), OUTPUT_AMOUNT_DEBOUNCE_MILLIS);
    return () => clearTimeout(timer);
  }, [isOutputAmount, parsedAmount]);
  const isDebouncing = isOutputAmount && debouncedAmount !== parsedAmount;
  const canQuote = !!quoteInToken && !!outToken && inputCurrency?.decimals !== undefined &&
    typedDecimals !== undefined && BN(parsedAmount).gt(0) &&
    !!chainId && !disabled;
  const query = useQuery<BestTradeQuote>({
    queryKey: [...quoteScopeKey, amountField, parsedAmount],
    queryFn: client
      ? async ({ signal }) => {
          const tokenUsd = isCustomSlippage ? undefined
            : await getQuoteTokenUsd({ tokenAddress: slippageTokenAddress, chainId, cacheSeconds: TOKEN_USD_CACHE_SECONDS, signal });
          signal.throwIfAborted();
          // Value the typed side once; output quotes have not resolved their input yet.
          const amountUsd = tokenUsd === undefined ? undefined
            : BN(parsedAmount).shiftedBy(-typedDecimals!).times(tokenUsd).toFixed();
          const slippagePercent = isCustomSlippage ? slippage : getSwapSlippage({
            amountUsd,
            slippage,
          }).slippagePercent;
          signal.throwIfAborted();
          const quote = await client.getQuote({
            inToken: quoteInToken,
            outToken,
            ...(isOutputAmount ? { outAmount: parsedAmount } : { inAmount: parsedAmount }),
            user,
            slippage: slippagePercent,
            signal,
          });
          signal.throwIfAborted();
          return {
            outAmount: quote.netAmountOut,
            minAmountOut: quote.minimumAmountOut,
            inToken,
            outToken,
            inAmount: quote.request.inAmount,
            gas: "0",
            originalQuote: quote,
          };
        }
      : skipToken,
    staleTime: QUOTE_REFRESH_MILLIS,
    refetchInterval: pauseQuote ? false : QUOTE_REFRESH_MILLIS,
    refetchOnMount: true,
    refetchOnReconnect: true,
    retry: isOutputAmount ? false : 1,
    retryOnMount: !isOutputAmount,
    refetchOnWindowFocus: false,
    enabled: canQuote && !!client && !pauseQuote && !isDebouncing,
  });

  const error = canQuote && !isDebouncing ? (client ? query.error : clientError) : null;
  return {
    data: canQuote && !isDebouncing && client && !query.error ? query.data : undefined,
    error,
    isLoading: canQuote && (isDebouncing || isClientLoading || query.isLoading || (isOutputAmount && query.isFetching)),
    // A successful client retry enables the quote query on the next render.
    refetch: () => {
      if (canQuote && !isDebouncing && !useSwapStore.getState().pauseQuote) {
        return client ? query.refetch({ cancelRefetch: false }) : refetchClient();
      }
    },
  };
};

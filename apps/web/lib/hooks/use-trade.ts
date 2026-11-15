import { skipToken, useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useEffect, useState } from "react";
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

export const SWAP_QUOTE_QUERY_KEY = ["spot-swap-quote"] as const;
const QUOTE_REFRESH_MILLIS = 10_000;
const OUTPUT_AMOUNT_DEBOUNCE_MILLIS = 250;

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
    if (!client || !slippageTokenAddress || isCustomSlippage || disabled) return;
    const controller = new AbortController();
    void client.getTokenUsd({ tokenAddress: slippageTokenAddress, signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [client, slippageTokenAddress, isCustomSlippage, disabled]);
  const quoteScopeKey = [...SWAP_QUOTE_QUERY_KEY, {
    chainId, partner, apiUrl: client?.apiUrl,
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
          const policy = await client.getSwapSlippage({
            // Output-side USD classifies the target once, before the service resolves its input.
            tokenAddress: slippageTokenAddress,
            typedInputAmount: formatUnits(BigInt(parsedAmount), typedDecimals!),
            slippage,
            isCustom: isCustomSlippage,
            signal,
          });
          signal.throwIfAborted();
          const quote = await client.getQuote({
            inToken: quoteInToken,
            outToken,
            ...(isOutputAmount ? { outAmount: parsedAmount } : { inAmount: parsedAmount }),
            user,
            slippage: policy.slippagePercent,
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

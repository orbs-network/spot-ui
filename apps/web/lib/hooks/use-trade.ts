import { skipToken, useQuery } from "@tanstack/react-query";
import { useSpotClient } from "./use-spot-client";
import { getSwapMinimumOutput } from "../swap-quote";
import { useSettings } from "./use-settings";
import { BestTradeQuote, Currency } from "../types";

import BN from "bignumber.js";
import {
  getWrappedNativeCurrency,
  isNativeAddress,
  toAmountUI,
  toAmountRaw,
} from "../utils";
import { useConnection } from "wagmi";
import { useSwapStore } from "./store";
import { useMemo } from "react";
import { useUSDPrice } from "./use-usd-price";
import { useSelectedFormTab } from "./use-tabs";
import { TABS } from "../types";

export const SWAP_QUOTE_QUERY_KEY = ["spot-swap-quote"] as const;

const useQuoteSwap = (
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
  const isSwap = useSelectedFormTab()?.value === TABS.SWAP;
  const inToken = inputCurrency?.address ?? "";
  const outToken = outputCurrency?.address ?? "";
  const user = account ?? "0x0000000000000000000000000000000000000001";
  const canQuote = !!inToken && !!outToken && BN(parsedInputAmount).gt(0) &&
    !!chainId && isSwap && !disabled && !pauseQuote;
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
            minAmountOut: getSwapMinimumOutput(quote.netAmountOut, slippage),
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
    data: client && !query.error ? query.data : undefined,
    error,
    isError: !!error,
    isLoading: canQuote && (isClientLoading || query.isLoading),
    // A successful client retry enables the quote query on the next render.
    refetch: () => client ? query.refetch() : refetchClient(),
  };
};

const useSyntheticTrade = (
  inputCurrency?: Currency,
  outputCurrency?: Currency,
  parsedInputAmount = ""
) => {
  const srcUSDPrice = useUSDPrice({
    token: inputCurrency?.address,
  });
  const dstUSDPrice = useUSDPrice({
    token: outputCurrency?.address,
  });


  return useMemo(() => {
    try {
      if (!inputCurrency || !outputCurrency || BN(parsedInputAmount).eq(0)) {
        return {
          isLoading: false,
          trade: undefined,
          refetch: () => {},
        };
      }

      if (srcUSDPrice.isLoading || dstUSDPrice.isLoading) {
        return {
          isLoading: true,
          trade: undefined,
          refetch: () => {},
        };
      }

      if (!srcUSDPrice.data || !dstUSDPrice.data) {
        return {
          isLoading: false,
          trade: undefined,
          refetch: () => {},
        };
      }

      const typedSrcAmount = toAmountUI(
        parsedInputAmount,
        inputCurrency?.decimals ?? 18
      );

      const marketPrice = toAmountRaw(
        BN(srcUSDPrice.data)
          .div(dstUSDPrice.data)
          .multipliedBy(typedSrcAmount)
          .toFixed(),
        outputCurrency?.decimals ?? 18
      );

      return {
        isLoading: false,
        trade: {
          outAmount: marketPrice,
          minAmountOut: marketPrice,
          inToken: inputCurrency!.address,
          outToken: outputCurrency!.address,
          inAmount: parsedInputAmount,
          gas: "0",
          originalQuote: undefined,
        },
        refetch: () => {},
      };
    } catch (error) {
      console.log(error);
      return {
        isLoading: false,
        trade: undefined,
        refetch: () => {},
      };
    }
  }, [
    srcUSDPrice.data,
    srcUSDPrice.isLoading,
    dstUSDPrice.data,
    dstUSDPrice.isLoading,
    inputCurrency,
    outputCurrency,
    parsedInputAmount,
  ]);
};

export const useTrade = (
  inputCurrency?: Currency,
  outputCurrency?: Currency,
  parsedInputAmount = "",
  disabled = false,
) => {
  const isSwap = useSelectedFormTab()?.value === TABS.SWAP;

  const swapQuote = useQuoteSwap(
    inputCurrency,
    outputCurrency,
    parsedInputAmount,
    disabled,
  );
  const syntheticTrade = useSyntheticTrade(
    inputCurrency,
    outputCurrency,
    parsedInputAmount
  );

  return {
    isLoading: !disabled && (isSwap ? swapQuote.isLoading : syntheticTrade.isLoading),
    error: isSwap ? swapQuote.error : null,
    refetch: () => {
      if (!isSwap) return syntheticTrade.refetch();
      if (!useSwapStore.getState().pauseQuote) return swapQuote.refetch();
    },
    data: disabled
      ? undefined
      : isSwap
        ? swapQuote.isError ? undefined : swapQuote.data
        : syntheticTrade.trade,
  };
};

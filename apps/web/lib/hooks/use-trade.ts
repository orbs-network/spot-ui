import { useQuery } from "@tanstack/react-query";
import { useLiquidityHub } from "./liquidity-hub";
import { BestTradeQuote, Currency } from "../types";
import { useSettings } from "./use-settings";
import BN from "bignumber.js";
import {
  getWrappedNativeCurrency,
  isNativeAddress,
  toAmountUI,
  toAmountWei,
} from "../utils";
import { useConnection } from "wagmi";
import { useSwapStore } from "./store";
import { useMemo } from "react";
import { useUSDPrice } from "./use-usd-price";
import { useIsSpotTab } from "./use-tabs";

const stopQuoteLiquidityHub = (_error?: string) => {
  if (!_error) return false;
  const error = _error.toLowerCase();
  if (error.includes("not supported")) {
    return true;
  }
  if (error.includes("ldv")) {
    return true;
  }
  return false;
};

const useQuoteLiquidityHub = (
  inputCurrency?: Currency,
  outputCurrency?: Currency,
  parsedInputAmount = ""
) => {
  const liquidityHub = useLiquidityHub();
  const { slippage } = useSettings();
  const { pauseQuote } = useSwapStore();
  const { chainId, address: account } = useConnection();
  const inputCurrencyAddress = inputCurrency?.address ?? "";
  const outputCurrencyAddress = outputCurrency?.address ?? "";
  const isSpotTab = useIsSpotTab();
  return useQuery<BestTradeQuote>({
    queryKey: [
      "quote-liquidity-hub",
      inputCurrencyAddress,
      outputCurrencyAddress,
      parsedInputAmount,
      slippage,
    ],
    queryFn: async ({ signal }) => {
      const quote = await liquidityHub.getQuote({
        fromToken: isNativeAddress(inputCurrencyAddress)
          ? getWrappedNativeCurrency(chainId!)?.address ?? ""
          : inputCurrencyAddress!,
        toToken: outputCurrencyAddress!,
        inAmount: parsedInputAmount,
        dexMinAmountOut: "-1",
        slippage: slippage,
        signal,
        account: account,
      });
      return {
        outAmount: quote.outAmount,
        minAmountOut: quote.minAmountOut,
        inToken: inputCurrency!.address,
        outToken: outputCurrency!.address,
        inAmount: quote.inAmount,
        gas: quote.gasAmountOut as string,
        originalQuote: quote,
      };
    },
    refetchInterval: (it) => {
      if (stopQuoteLiquidityHub(it.state.error?.message)) {
        return false;
      }
      return pauseQuote ? false : 10_000;
    },
    retry: (it, error) => {
      if (stopQuoteLiquidityHub(error?.message)) {
        return false;
      }
      return true;
    },
    refetchOnWindowFocus: false,
    enabled:
      !!inputCurrencyAddress &&
      !!outputCurrencyAddress &&
      BN(parsedInputAmount).gt(0) &&
      !!chainId &&
      !isSpotTab,
  });
};

const useSyntheticTrade = (
  inputCurrency?: Currency,
  outputCurrency?: Currency,
  parsedInputAmount = ""
) => {
  const srcUSDPrice = useUSDPrice({
    token: inputCurrency?.address,
  }).data;
  const dstUSDPrice = useUSDPrice({
    token: outputCurrency?.address,
  }).data;


  return useMemo(() => {
    try {
      if (!inputCurrency || !outputCurrency || BN(parsedInputAmount).eq(0)) {
        return {
          isLoading: false,
          trade: undefined,
          refetch: () => {},
        };
      }

      if (!srcUSDPrice || !dstUSDPrice) {
        return {
          isLoading: true,
          trade: undefined,
          refetch: () => {},
        };
      }

      const typedSrcAmount = toAmountUI(
        parsedInputAmount,
        inputCurrency?.decimals ?? 18
      );

      const marketPrice = toAmountWei(
        BN(srcUSDPrice).div(dstUSDPrice).multipliedBy(typedSrcAmount).toFixed(),
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
    srcUSDPrice,
    dstUSDPrice,
    inputCurrency,
    outputCurrency,
    parsedInputAmount,
  ]);
};

export const useTrade = (
  inputCurrency?: Currency,
  outputCurrency?: Currency,
  parsedInputAmount = ""
) => {
  const isSpotTab = useIsSpotTab();

  const liquidityHubQuote = useQuoteLiquidityHub(
    inputCurrency,
    outputCurrency,
    parsedInputAmount
  );
  const syntheticTrade = useSyntheticTrade(
    inputCurrency,
    outputCurrency,
    parsedInputAmount
  );

  const showSyntheticTrade = !isSpotTab ? false :  Boolean(liquidityHubQuote.error || isSpotTab);
  



  return {
    isLoading: showSyntheticTrade
      ? syntheticTrade.isLoading
      : liquidityHubQuote.isLoading,
    refetch: showSyntheticTrade
      ? syntheticTrade.refetch
      : liquidityHubQuote.refetch,
    data: showSyntheticTrade ? syntheticTrade.trade : liquidityHubQuote.data,
  };
};

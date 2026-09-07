import { SwapType } from "../types";
import { useSwapStore } from "./store";
import { useSwapParams } from "./use-swap-params";
import { useCurrency } from "./use-currencies";
import { useFormatDecimals, useToAmountUI, useToAmountWei } from "./common";
import { useTrade } from "./use-trade";
import { useConnection } from "wagmi";
import { getWrappedNativeAction } from "../utils";
import { useMemo } from "react";
import type { BestTradeQuote } from "../types";
import { DEFAULT_CHAIN_ID } from "../consts";

export const useDerivedSwap = () => {
  const { chainId } = useConnection();
  const {
    inputCurrency: inputCurrencyAddress,
    outputCurrency: outputCurrencyAddress,
    swapType,
  } = useSwapParams();
  const store = useSwapStore();
  const inputCurrency = useCurrency(inputCurrencyAddress ?? undefined);
  const outputCurrency = useCurrency(outputCurrencyAddress ?? undefined);

  const parsedInputAmount = useToAmountWei(
    inputCurrency?.decimals,
    store.inputAmount
  );

  const wrappedNativeAction = getWrappedNativeAction(
    inputCurrency?.address,
    outputCurrency?.address,
    chainId ?? DEFAULT_CHAIN_ID,
  );

  const {
    data: quotedTrade,
    isLoading: isLoadingTrade,
    refetch: refetchTrade,
  } = useTrade(
    inputCurrency,
    outputCurrency,
    parsedInputAmount,
    Boolean(wrappedNativeAction),
  );

  const trade = useMemo((): BestTradeQuote | undefined => {
    if (!wrappedNativeAction || !inputCurrency || !outputCurrency) {
      return quotedTrade;
    }

    return {
      outAmount: parsedInputAmount,
      minAmountOut: parsedInputAmount,
      inToken: inputCurrency.address,
      outToken: outputCurrency.address,
      inAmount: parsedInputAmount,
      gas: "0",
      originalQuote: undefined,
    };
  }, [
    inputCurrency,
    outputCurrency,
    parsedInputAmount,
    quotedTrade,
    wrappedNativeAction,
  ]);

  const outputAmount = useFormatDecimals(useToAmountUI(
    outputCurrency?.decimals,
    trade?.outAmount
  ));

  return {
    inputCurrency,
    outputCurrency,
    swapType: swapType as SwapType,
    inputAmount: store.inputAmount,
    parsedInputAmount,
    trade,
    isLoadingTrade: wrappedNativeAction ? false : isLoadingTrade,
    refetchTrade,
    outputAmount,
    wrappedNativeAction,
  };
};

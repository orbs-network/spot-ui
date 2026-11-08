import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";
import { SwapType } from "../types";
import { useSwapStore } from "./store";
import { useSwapParams } from "./use-swap-params";
import { useCurrency } from "./use-currencies";
import { useFormatDecimals, useToAmountUI, useToAmountWei } from "./common";
import { useTrade } from "./use-trade";
import { getWrappedNativeAction } from "../utils";
import { useMemo } from "react";
import type { BestTradeQuote } from "../types";
import { DEFAULT_CHAIN_ID } from "../consts";
import BN from "bignumber.js";

const getQuoteTokenUsdPrice = (
  amountUsd?: string,
  rawAmount?: string,
  decimals?: number,
): string | undefined => {
  if (amountUsd === undefined || !rawAmount || decimals === undefined) return undefined;
  const usd = BN(amountUsd);
  const amount = BN(rawAmount);
  if (!usd.isFinite() || !usd.gt(0) || !amount.isFinite() || !amount.gt(0)) return undefined;
  return usd.shiftedBy(decimals).dividedBy(amount).toFixed();
};

export const useDerivedSwap = () => {
  const chainId = useActiveChainId();
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
    error: quoteError,
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
  const quote = trade?.originalQuote;

  return {
    inputCurrency,
    outputCurrency,
    swapType: swapType as SwapType,
    inputAmount: store.inputAmount,
    parsedInputAmount,
    trade,
    inputTokenUsdPrice: getQuoteTokenUsdPrice(quote?.inputAmountUsd, quote?.request.inAmount, inputCurrency?.decimals),
    outputTokenUsdPrice: getQuoteTokenUsdPrice(quote?.netAmountOutUsd, quote?.netAmountOut, outputCurrency?.decimals),
    isLoadingTrade: wrappedNativeAction ? false : isLoadingTrade,
    refetchTrade,
    quoteError,
    outputAmount,
    wrappedNativeAction,
  };
};

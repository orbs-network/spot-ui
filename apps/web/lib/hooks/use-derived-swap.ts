import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";
import { useSwapStore } from "./store";
import { useSwapParams } from "./use-swap-params";
import { useCurrency } from "./use-currencies";
import { useFormatDecimals, useToAmountUI, useToAmountWei } from "./common";
import { useTrade } from "./use-trade";
import { getWrappedNativeAction, toAmountRaw, toAmountUI } from "../utils";
import { useMemo } from "react";
import { useSelectedFormTab } from "./use-tabs";
import type { BestTradeQuote } from "../types";
import { Field, TABS } from "../types";
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

  const amountField = useSelectedFormTab()?.value === TABS.SWAP ? store.independentField : Field.INPUT;
  const isOutputAmount = amountField === Field.OUTPUT;
  const typedAmount = isOutputAmount ? store.outputAmount : store.inputAmount;
  const typedCurrency = isOutputAmount ? outputCurrency : inputCurrency;
  const hasExcessPrecision = typedCurrency !== undefined &&
    (typedAmount.split(".")[1]?.length ?? 0) > typedCurrency.decimals;
  const parsedTypedAmount = useToAmountWei(
    typedCurrency?.decimals,
    hasExcessPrecision ? "" : typedAmount,
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
    parsedTypedAmount,
    Boolean(wrappedNativeAction),
    amountField,
  );

  const trade = useMemo((): BestTradeQuote | undefined => {
    if (!wrappedNativeAction || !inputCurrency || !outputCurrency) {
      return quotedTrade;
    }

    // Wrapped/native pairs exchange the same UI amount, independently of token precision.
    const inputRaw = isOutputAmount
      ? toAmountRaw(hasExcessPrecision ? "" : typedAmount, inputCurrency.decimals)
      : parsedTypedAmount;
    const outputRaw = toAmountRaw(toAmountUI(inputRaw, inputCurrency.decimals), outputCurrency.decimals);
    return {
      outAmount: outputRaw,
      minAmountOut: outputRaw,
      inToken: inputCurrency.address,
      outToken: outputCurrency.address,
      inAmount: inputRaw,
      gas: "0",
      originalQuote: undefined,
    };
  }, [
    inputCurrency,
    outputCurrency,
    parsedTypedAmount,
    isOutputAmount,
    hasExcessPrecision,
    typedAmount,
    quotedTrade,
    wrappedNativeAction,
  ]);

  const outputAmount = useFormatDecimals(useToAmountUI(
    outputCurrency?.decimals,
    trade?.outAmount
  ));
  const quote = trade?.originalQuote;
  const inputAmountUsd = quote?.inputAmountUsd;
  const netOutputAmountUsd = quote?.netAmountOutUsd;
  const parsedInputAmount = isOutputAmount ? trade?.inAmount ?? "" : parsedTypedAmount;
  const parsedOutputAmount = isOutputAmount ? parsedTypedAmount : trade?.outAmount ?? "";
  let outputAmountUsd = netOutputAmountUsd;
  if (isOutputAmount) {
    const minimumUsd = quote?.minimumAmountOut === parsedOutputAmount ? quote.minimumAmountOutUsd : undefined;
    const minimumUsdValue = minimumUsd === undefined ? undefined : BN(minimumUsd);
    const netUsd = netOutputAmountUsd === undefined ? undefined : BN(netOutputAmountUsd);
    const targetRaw = BN(parsedOutputAmount || "0");
    const netRaw = BN(quote?.netAmountOut || "0");
    outputAmountUsd = minimumUsdValue?.isFinite() && minimumUsdValue.gte(0)
      ? minimumUsd
      : netUsd?.isFinite() && netUsd.gte(0) && netRaw.isFinite() && netRaw.gt(0) && targetRaw.isFinite() && targetRaw.gt(0)
        ? netUsd.times(targetRaw).dividedBy(netRaw).toFixed()
        : undefined;
  }
  const inputAmount = isOutputAmount
    ? BN(parsedInputAmount || "0").gt(0) ? toAmountUI(parsedInputAmount, inputCurrency?.decimals) : ""
    : store.inputAmount;

  return {
    inputCurrency,
    outputCurrency,
    swapType,
    inputAmount,
    amountField,
    typedAmount,
    parsedTypedAmount,
    amountError: hasExcessPrecision ? `Enter an amount with at most ${typedCurrency.decimals} decimal places.` : undefined,
    parsedInputAmount,
    parsedOutputAmount,
    trade,
    inputAmountUsd,
    outputAmountUsd,
    inputTokenUsdPrice: getQuoteTokenUsdPrice(
      inputAmountUsd,
      quote?.request.inAmount,
      inputCurrency?.decimals,
    ),
    outputTokenUsdPrice: getQuoteTokenUsdPrice(netOutputAmountUsd, quote?.netAmountOut, outputCurrency?.decimals),
    isLoadingTrade: wrappedNativeAction ? false : isLoadingTrade,
    refetchTrade,
    quoteError,
    outputAmount: isOutputAmount ? store.outputAmount : outputAmount,
    wrappedNativeAction,
  };
};

"use client";

import { useEffect, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { formatUnits } from "viem";
import BN from "bignumber.js";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useBalance, useRefetchSelectedCurrenciesBalances } from "@/lib/hooks/use-balances";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useDirectSwapExecution, type SwapReview } from "@/lib/hooks/use-direct-swap-execution";
import { useSettings } from "@/lib/hooks/use-settings";
import { useSpotClient } from "@/lib/hooks/use-spot-client";
import { useSpotPartners } from "@/lib/hooks/use-spot-partners";
import { useSwapStore } from "@/lib/hooks/store";
import { SWAP_QUOTE_QUERY_KEY } from "@/lib/hooks/use-trade";
import { useWalletInteractions } from "@/lib/hooks/use-wallet-interactions";
import { Field } from "@/lib/types";
import { formatDecimals, getWrappedNativeCurrency, isNativeAddress } from "@/lib/utils";
import { CurrencyCard } from "../currency-card";
import { FormContainer } from "../form-container";
import { ToggleCurrencies } from "../toggle-currencies";
import { Button } from "../ui/button";
import { USD } from "../ui/usd";
import { WrappedNativeButton } from "../wrapped-native-button";
import { SpotFooter } from "../spot/footer";
import { SwapReviewDialog } from "./swap-review-dialog";

export const SwapForm = () => {
  const { inputCurrency, outputCurrency, inputAmount, parsedInputAmount, trade, outputAmount,
    isLoadingTrade, quoteError, refetchTrade, wrappedNativeAction } = useDerivedSwap();
  const { data: client, chainId, partner, error: clientError, isLoading: isClientLoading, refetch: refetchClient } = useSpotClient();
  const { address: account } = useConnection();
  const { openConnectModal } = useConnectModal();
  const { handleCurrencyChange, setInputAmount } = useActionHandlers();
  const { wei: inputBalanceRaw, isLoading: isBalanceLoading } = useBalance(inputCurrency);
  const { mutateAsync: refreshBalances } = useRefetchSelectedCurrenciesBalances();
  const { data: partners } = useSpotPartners();
  const { slippage } = useSettings();
  const walletInteractions = useWalletInteractions();
  const quote = trade?.originalQuote;
  const supported = !partners || partners.some(item => item.name === partner && item.chainId === chainId);
  const contextKey = JSON.stringify([chainId, partner, account?.toLowerCase(), inputCurrency?.address.toLowerCase(),
    outputCurrency?.address.toLowerCase(), parsedInputAmount, inputAmount, slippage]);
  const execution = useDirectSwapExecution({ contextKey, walletInteractions, refreshBalances });
  const [review, setReview] = useState<SwapReview>();
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const setPauseQuote = useSwapStore(state => state.setPauseQuote);
  useEffect(() => {
    const pause = execution.isActive || execution.phase === "unconfirmed";
    setPauseQuote(pause);
    if (pause) void queryClient.cancelQueries({ queryKey: SWAP_QUOTE_QUERY_KEY });
    return () => setPauseQuote(false);
  }, [execution.isActive, execution.phase, queryClient, setPauseQuote]);

  const inputAddress = isNativeAddress(inputCurrency?.address)
    ? getWrappedNativeCurrency(chainId)?.address : inputCurrency?.address;
  const quoteMatches = Boolean(quote && quote.request.chainId === chainId && quote.request.partner === partner &&
    quote.request.inToken.toLowerCase() === inputAddress?.toLowerCase() &&
    quote.request.outToken.toLowerCase() === outputCurrency?.address.toLowerCase() &&
    quote.request.inAmount === parsedInputAmount && quote.request.slippage === slippage);
  const hasAmount = BN(parsedInputAmount || "0").gt(0);
  const insufficientBalance = !execution.canUseConfirmedWrap && inputBalanceRaw !== undefined && BN(inputBalanceRaw).lt(parsedInputAmount || "0");
  const canReview = Boolean(supported && client && account && inputCurrency && outputCurrency && hasAmount &&
    quoteMatches && !isLoadingTrade && (!isBalanceLoading || execution.canUseConfirmedWrap) &&
    (inputBalanceRaw !== undefined || execution.canUseConfirmedWrap) && !insufficientBalance);
  const showReview = () => {
    if (execution.isActive || execution.phase === "unconfirmed" || execution.phase === "success") {
      setIsOpen(true);
      return;
    }
    if (!canReview || !client || !quote || !account || !inputCurrency || !outputCurrency) return;
    execution.reset();
    setReview({
      client, account, contextKey, quote: structuredClone(quote),
      inputToken: { ...inputCurrency }, outputToken: { ...outputCurrency }, inputAmountUi: inputAmount,
      outputAmountUi: formatUnits(BigInt(quote.netAmountOut), outputCurrency.decimals),
    });
    setIsOpen(true);
  };
  const onOpenChange = (open: boolean) => {
    if (execution.isActive) return;
    setIsOpen(open);
    if (!open && execution.phase === "success") {
      if (execution.review?.contextKey === contextKey) setInputAmount("");
      execution.reset();
      setReview(undefined);
    } else if (!open && execution.phase === "failed") {
      execution.reset();
      setReview(undefined);
    }
  };
  const isLocked = execution.isActive || execution.phase === "unconfirmed";
  const text = execution.phase === "unconfirmed" ? "Check order status"
    : execution.isActive ? "Executing swap…"
    : execution.phase === "success" ? "View completed swap"
    : !hasAmount ? "Enter an amount"
    : isClientLoading ? "Loading configuration…"
    : isLoadingTrade ? "Fetching quote…"
    : insufficientBalance ? "Insufficient balance"
    : quoteError ? "Quote unavailable"
    : "Review Swap";
  const shown = execution.review ?? review;

  return (
    <FormContainer>
      {!supported && <p role="status" className="text-sm text-muted-foreground">Choose a supported network for {partner}.</p>}
      <div className="flex flex-col gap-1">
        <CurrencyCard currency={inputCurrency} onCurrencyChange={currency => handleCurrencyChange(currency, Field.INPUT)}
          onAmountChange={setInputAmount} amount={inputAmount} title="From" usd={<USD value={quote?.inputAmountUsd} isLoading={isLoadingTrade} />} />
        <ToggleCurrencies />
        <CurrencyCard currency={outputCurrency} onCurrencyChange={currency => handleCurrencyChange(currency, Field.OUTPUT)}
          amount={formatDecimals(outputAmount, 6)} title="To" disabled isLoading={isLoadingTrade}
          usd={<USD value={quote?.netAmountOutUsd} isLoading={isLoadingTrade} />} />
      </div>
      {wrappedNativeAction && !isLocked ? <WrappedNativeButton action={wrappedNativeAction} /> : (
        <>
          {clientError && !isLocked && <div role="alert" className="flex flex-col gap-2 text-sm">
            <p>Swap configuration is unavailable.</p><Button type="button" variant="outline" onClick={() => void refetchClient()}>Try again</Button>
          </div>}
          {quoteError && !clientError && !isLocked && <p role="alert" className="text-sm text-destructive">{quoteError.message} <button type="button" className="underline" onClick={() => void refetchTrade()}>Try again</button></p>}
          <Button type="button" onClick={!account && !isLocked && execution.phase !== "success" ? openConnectModal : showReview}
            disabled={Boolean(account) && !isLocked && execution.phase !== "success" && !canReview}>
            {!account && !isLocked && execution.phase !== "success" ? "Connect Wallet" : text}
          </Button>
        </>
      )}
      <SwapReviewDialog open={isOpen} onOpenChange={onOpenChange} review={review} execution={execution}
        canConfirm={Boolean(shown && shown.contextKey === contextKey && canReview)}
        onConfirm={() => { if (shown && shown.contextKey === contextKey && canReview) void execution.execute(shown); }}
        onReviewAgain={showReview} />
      <SpotFooter client={client} />
    </FormContainer>
  );
};

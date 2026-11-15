"use client";

import { useEffect, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import BN from "bignumber.js";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useBalance, useRefetchSelectedCurrenciesBalances } from "@/lib/hooks/use-balances";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useDirectSwapExecution, type SwapReviewContext } from "@/lib/hooks/use-direct-swap-execution";
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
    isLoadingTrade, quoteError, refetchTrade, wrappedNativeAction,
    amountError, inputAmountUsd, outputAmountUsd, amountField, typedAmount, parsedTypedAmount,
    parsedOutputAmount } = useDerivedSwap();
  const { data: client, chainId, partner, error: clientError, isLoading: isClientLoading, refetch: refetchClient } = useSpotClient();
  const { address: account } = useConnection();
  const { openConnectModal } = useConnectModal();
  const { handleCurrencyChange, setInputAmount, setOutputAmount } = useActionHandlers();
  const { wei: inputBalanceRaw, isLoading: isBalanceLoading } = useBalance(inputCurrency);
  const { mutateAsync: refreshBalances } = useRefetchSelectedCurrenciesBalances();
  const { data: partners } = useSpotPartners();
  const { slippage, isCustomSlippage } = useSettings();
  const walletInteractions = useWalletInteractions();
  const quote = trade?.originalQuote;
  const isOutputAmount = amountField === Field.OUTPUT;
  const supported = !partners || partners.some(item => item.name === partner && item.chainId === chainId);
  const contextKey = JSON.stringify([chainId, partner, client?.apiUrl, account?.toLowerCase(), inputCurrency?.address.toLowerCase(),
    outputCurrency?.address.toLowerCase(), inputCurrency?.decimals, outputCurrency?.decimals,
    amountField, typedAmount, parsedTypedAmount, slippage, isCustomSlippage]);
  const execution = useDirectSwapExecution({ contextKey, walletInteractions, refreshBalances });
  const wrappedInputCurrency = getWrappedNativeCurrency(chainId);
  const wrappedBalance = useBalance(wrappedInputCurrency);
  const useWrappedBalance = execution.phase === "price-changed" && execution.hasConfirmedWrap &&
    execution.review?.contextKey === contextKey && isNativeAddress(inputCurrency?.address);
  const [reviewContext, setReviewContext] = useState<SwapReviewContext>();
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const setPauseQuote = useSwapStore(state => state.setPauseQuote);
  const hasPreparedQuote = Boolean(execution.hostExecution?.preparedOrder);
  useEffect(() => {
    const pause = (execution.isActive && hasPreparedQuote) ||
      execution.phase === "settling" || execution.phase === "unconfirmed" || execution.phase === "success";
    setPauseQuote(pause);
    if (pause) void queryClient.cancelQueries({ queryKey: SWAP_QUOTE_QUERY_KEY });
    return () => setPauseQuote(false);
  }, [execution.isActive, execution.phase, hasPreparedQuote, queryClient, setPauseQuote]);
  useEffect(() => {
    if (execution.phase === "price-changed") {
      void queryClient.invalidateQueries({ queryKey: SWAP_QUOTE_QUERY_KEY });
    }
  }, [execution.phase, execution.priceChangedAt, queryClient]);

  const inputAddress = isNativeAddress(inputCurrency?.address)
    ? getWrappedNativeCurrency(chainId)?.address : inputCurrency?.address;
  const quoteMatches = Boolean(quote && quote.request.chainId === chainId && quote.request.partner === partner &&
    quote.request.inToken.toLowerCase() === inputAddress?.toLowerCase() &&
    quote.request.outToken.toLowerCase() === outputCurrency?.address.toLowerCase() &&
    quote.request.inAmount === parsedInputAmount &&
    (isOutputAmount
      ? quote.requestedOutAmount === parsedOutputAmount && BN(quote.minimumAmountOut).gte(parsedOutputAmount)
      : quote.requestedOutAmount === undefined));
  const hasAmount = BN(parsedTypedAmount || "0").gt(0);
  const availableBalanceRaw = useWrappedBalance ? wrappedBalance.wei : inputBalanceRaw;
  const balanceLoading = useWrappedBalance ? wrappedBalance.isLoading : isBalanceLoading;
  const insufficientBalance = availableBalanceRaw !== undefined && BN(availableBalanceRaw).lt(parsedInputAmount || "0");
  const requiresMoreWrapping = useWrappedBalance && execution.confirmedWrapAmountRaw !== undefined &&
    BN(parsedInputAmount || "0").gt(execution.confirmedWrapAmountRaw);
  const canReview = Boolean(supported && client && account && inputCurrency && outputCurrency && hasAmount &&
    quoteMatches && !amountError && !isLoadingTrade && !balanceLoading &&
    availableBalanceRaw !== undefined && !insufficientBalance && !requiresMoreWrapping);
  const hasCurrentReviewQuote = quoteMatches && (execution.phase !== "price-changed" ||
    (quote && execution.priceChangedAt !== undefined && quote.receivedAt > execution.priceChangedAt));
  const reviewScope = execution.review ?? reviewContext;
  const frozenQuote = execution.review && (execution.isActive || execution.phase === "unconfirmed" || execution.phase === "success")
    ? execution.review.quote : undefined;
  const currentReviewQuote = frozenQuote ?? (reviewScope?.contextKey === contextKey && hasCurrentReviewQuote ? quote : undefined);
  const review = reviewScope ? {
    ...reviewScope,
    quote: currentReviewQuote,
  } : undefined;
  const priceChangedNotice = reviewScope?.contextKey !== contextKey
    ? "The wallet or swap changed. Close this dialog and review the current swap."
    : quoteError ? "A current quote is unavailable. Update the quote to review the new price."
    : !review?.quote ? "The price changed. Waiting for an updated quote…"
    : requiresMoreWrapping ? `The required input increased after wrapping. Select ${wrappedInputCurrency?.symbol || "the wrapped token"} and review its balance before trying again.`
    : balanceLoading ? "Checking your balance…"
    : insufficientBalance ? `Insufficient ${useWrappedBalance ? wrappedInputCurrency?.symbol : inputCurrency?.symbol} balance. Check your balance before accepting.`
    : "The price changed. Review the updated amounts before accepting.";
  const showReview = () => {
    if (execution.isActive || execution.phase === "unconfirmed" || execution.phase === "success" ||
      (execution.phase === "price-changed" && execution.review?.contextKey === contextKey)) {
      setIsOpen(true);
      return;
    }
    if (!canReview || !client || !quote || !account || !inputCurrency || !outputCurrency) return;
    execution.reset();
    setReviewContext({
      client, account, contextKey,
      inputToken: { ...inputCurrency }, outputToken: { ...outputCurrency }, inputAmountUi: inputAmount,
      amountField, typedAmountUi: typedAmount,
    });
    setIsOpen(true);
  };
  const onOpenChange = (open: boolean) => {
    if (execution.isActive) return;
    setIsOpen(open);
    if (!open && execution.phase === "success") {
      if (execution.review?.contextKey === contextKey) setInputAmount("");
      execution.reset();
      setReviewContext(undefined);
    } else if (!open && execution.phase === "failed") {
      execution.reset();
      setReviewContext(undefined);
    }
  };
  const isLocked = execution.isActive || execution.phase === "unconfirmed";
  const text = execution.phase === "unconfirmed" ? "Check order status"
    : execution.isActive ? "Executing swap…"
    : execution.phase === "success" ? "View completed swap"
    : amountError ? "Check amount"
    : !hasAmount ? "Enter an amount"
    : isClientLoading ? "Loading configuration…"
    : isLoadingTrade ? "Fetching quote…"
    : insufficientBalance ? "Insufficient balance"
    : quoteError ? "Quote unavailable"
    : "Review Swap";

  return (
    <FormContainer>
      {!supported && <p role="status" className="text-sm text-muted-foreground">Choose a supported network for {partner}.</p>}
      <div className="flex flex-col gap-1">
        <CurrencyCard currency={inputCurrency} onCurrencyChange={currency => handleCurrencyChange(currency, Field.INPUT)}
          onAmountChange={setInputAmount} amount={inputAmount} title="From"
          isLoading={isOutputAmount && isLoadingTrade && !trade}
          usd={<USD value={inputAmountUsd} isLoading={isLoadingTrade && !trade} />} />
        <ToggleCurrencies />
        <CurrencyCard currency={outputCurrency} onCurrencyChange={currency => handleCurrencyChange(currency, Field.OUTPUT)}
          amount={isOutputAmount ? outputAmount : formatDecimals(outputAmount, 6)} onAmountChange={setOutputAmount}
          title="To" hidePercentageButtons isLoading={!isOutputAmount && isLoadingTrade && !trade}
          usd={<USD value={outputAmountUsd} isLoading={isLoadingTrade && !trade} />} />
      </div>
      {isOutputAmount && !wrappedNativeAction && <p className="text-sm text-muted-foreground">
        The output amount is your minimum received.
      </p>}
      {amountError && <p role="alert" className="text-sm text-destructive">{amountError}</p>}
      {quote && !wrappedNativeAction && <dl aria-live="polite" className="flex items-center justify-between text-sm text-muted-foreground">
        <dt>Slippage</dt>
        <dd>{quote.request.slippage}%</dd>
      </dl>}
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
        canConfirm={Boolean(review?.quote && review.contextKey === contextKey && canReview)}
        reviewNotice={execution.phase === "price-changed" ? <>
          <p role="status" className="text-sm text-muted-foreground">{priceChangedNotice}</p>
          {quoteError && reviewScope?.contextKey === contextKey && <Button type="button" variant="outline"
            onClick={() => void refetchTrade()}>Update quote</Button>}
        </> : undefined}
        onConfirm={() => {
          if (review?.quote && review.contextKey === contextKey && canReview) {
            void execution.execute({ ...review, quote: review.quote });
          }
        }}
        onReviewAgain={showReview} />
      <SpotFooter client={client} />
    </FormContainer>
  );
};

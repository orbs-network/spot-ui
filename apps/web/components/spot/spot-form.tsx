"use client";
import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";

import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ExecutionPhase,
  OrderType,
  AdvancedOrdersProvider,
  TimeUnit,
  useExecution,
  type Overrides,
  type Token,
} from "@orbs-network/spot-react";
import { useConnection } from "wagmi";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useBalance } from "@/lib/hooks/use-balances";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useSettings } from "@/lib/hooks/use-settings";
import { useSpotPartners } from "@/lib/hooks/use-spot-partners";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { useSwapStore } from "@/lib/hooks/store";
import { SWAP_QUOTE_QUERY_KEY } from "@/lib/hooks/use-trade";
import {
  useCallbacks,
  useSpotMarketQuote,
  useSpotPartner,
  useWalletInteractions,
} from "@/lib/hooks/spot-hooks";
import { Currency } from "@/lib/types";
import { getWrappedNativeCurrency } from "@/lib/utils";
import { FormContainer } from "../form-container";
import { ToggleCurrencies } from "../toggle-currencies";
import { Button } from "../ui/button";
import { Portal } from "../ui/portal";
import { WrappedNativeButton } from "../wrapped-native-button";
import { AdvancedOrdersFooter } from "./footer";
import { OrderSettings } from "./order-settings";
import { SpotsOrders } from "./orders";
import { PriceSettings } from "./price-settings";
import {
  ErrorFallback,
  DisclaimerPanel,
  InputsErrorPanel,
} from "./spot-form-support";
import { SpotFormContextProvider } from "./spot-form-context";
import { SubmitOrderDialog } from "./submit-order-dialog";
import { TokenPanel } from "./token-panel";

const useSpotToken = (currency?: Currency): Token | undefined =>
  useMemo(() => {
    if (!currency) return undefined;
    return {
      address: currency.address,
      decimals: currency.decimals,
      symbol: currency.symbol,
      logoUrl: currency.logoUrl,
    };
  }, [currency]);

const PauseQuotesDuringExecution = () => {
  const { phase } = useExecution();
  const pauseQuote = phase !== ExecutionPhase.IDLE;
  const setPauseQuote = useSwapStore((state) => state.setPauseQuote);
  const queryClient = useQueryClient();

  useEffect(() => {
    setPauseQuote(pauseQuote);
    if (pauseQuote) {
      void queryClient.cancelQueries({ queryKey: SWAP_QUOTE_QUERY_KEY });
    }
    return () => setPauseQuote(false);
  }, [pauseQuote, queryClient, setPauseQuote]);

  return null;
};

const BackgroundOrderStatus = () => {
  const { hasUnconfirmedExecutions, isUnconfirmed, isCheckingOrderStatus, checkOrderStatus } = useExecution();
  if (!hasUnconfirmedExecutions || isUnconfirmed) return null;

  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-sm text-muted-foreground">
        {isCheckingOrderStatus ? "Checking the previous order’s status…" : "A previous order’s submission is unconfirmed and may still complete."}
      </p>
      <Button type="button" variant="outline" onClick={checkOrderStatus} disabled={isCheckingOrderStatus} isLoading={isCheckingOrderStatus}>
        {isCheckingOrderStatus ? "Checking order status…" : "Check previous order status"}
      </Button>
    </div>
  );
};

const UnsupportedNetworkNotice = ({
  supported,
  account,
  partner,
}: {
  supported: boolean;
  account?: string;
  partner: string;
}) => {
  const { isUnconfirmed, phase, checkOrderStatus } = useExecution();
  const isCheckingStatus = phase === ExecutionPhase.SETTLING;

  if (supported) return null;

  return (
    <div className="flex flex-col gap-3">
      <p
        role="status"
        className="rounded-lg bg-muted p-4 text-sm text-muted-foreground"
      >
        {account
          ? `Choose a supported network in the navbar for ${partner}.`
          : `Connect your wallet, then choose a supported network for ${partner}.`}
      </p>
      {(isUnconfirmed || isCheckingStatus) && (
        <Button
          type="button"
          variant="outline"
          onClick={checkOrderStatus}
          disabled={isCheckingStatus}
          isLoading={isCheckingStatus}
        >
          {isCheckingStatus ? "Checking order status…" : "Check order status"}
        </Button>
      )}
    </div>
  );
};

export function SpotForm({ orderType }: { orderType: OrderType }) {
  const {
    inputCurrency, outputCurrency, inputAmount, inputTokenUsdPrice,
    outputTokenUsdPrice, wrappedNativeAction, quoteError, refetchTrade,
  } = useDerivedSwap();
  const { setInputAmount } = useActionHandlers();
  const chainId = useActiveChainId();
  const { address } = useConnection();
  const { priceProtection: priceProtectionPercent } = useSettings();
  const contextValue = useMemo(
    () => ({ orderType, setInputAmount }),
    [setInputAmount, orderType],
  );
  const { wei: inputBalanceRaw } = useBalance(inputCurrency);
  const inputToken = useSpotToken(inputCurrency);
  const outputToken = useSpotToken(outputCurrency);
  const wrappedNativeToken = useSpotToken(getWrappedNativeCurrency(chainId));
  const marketQuote = useSpotMarketQuote();
  const walletInteractions = useWalletInteractions();
  const partner = useSpotPartner();
  const { data: partners } = useSpotPartners();
  const supported =
    !partners ||
    partners.some((item) => item.name === partner && item.chainId === chainId);
  const callbacks = useCallbacks();
  const { minTradeSizeUsd, durationMinutes } = useSwapParams();
  const overrides = useMemo<Overrides | undefined>(
    () =>
      durationMinutes === undefined
        ? undefined
        : {
            state: {
              orderDuration: { value: durationMinutes, unit: TimeUnit.Minutes },
            },
          },
    [durationMinutes],
  );

  return (
    <SpotFormContextProvider value={contextValue}>
      <FormContainer>
        <AdvancedOrdersProvider
          chainId={supported ? chainId : undefined}
          inputAmountUi={inputAmount}
          walletInteractions={walletInteractions}
          account={address}
          partner={partner}
          inputBalanceRaw={inputBalanceRaw}
          inputToken={inputToken}
          outputToken={outputToken}
          wrappedNativeToken={wrappedNativeToken}
          priceProtectionPercent={priceProtectionPercent}
          orderType={orderType}
          inputTokenUsdPrice={inputTokenUsdPrice}
          outputTokenUsdPrice={outputTokenUsdPrice}
          marketQuote={marketQuote}
          minTradeSizeUsd={minTradeSizeUsd ?? 10}
          overrides={overrides}
          callbacks={callbacks}
          supportLegacyOrders={true}
          errorFallback={ErrorFallback}
          displayFeePercent={0.25}
        >
          <PauseQuotesDuringExecution />
          <BackgroundOrderStatus />
          <UnsupportedNetworkNotice supported={supported} account={address} partner={partner} />
          {supported && (
            <>
              <div className="flex flex-col gap-1">
                <div className="flex flex-col gap-0">
                  <TokenPanel isInputToken />
                  <ToggleCurrencies />
                  <TokenPanel isInputToken={false} />
                </div>
                {wrappedNativeAction ? (
                  <WrappedNativeButton action={wrappedNativeAction} />
                ) : (
                  <>
                    <PriceSettings />
                    <OrderSettings />
                    {quoteError && (
                      <div role="alert" className="text-sm text-destructive">
                        {quoteError.message} <button type="button" className="underline" onClick={() => void refetchTrade()}>Try again</button>
                      </div>
                    )}
                    <InputsErrorPanel />
                    <SubmitOrderDialog />
                    <DisclaimerPanel />
                  </>
                )}
              </div>
              <Portal containerId="spot-orders">
                <SpotsOrders />
              </Portal>
              <AdvancedOrdersFooter />
            </>
          )}
        </AdvancedOrdersProvider>
      </FormContainer>
    </SpotFormContextProvider>
  );
}

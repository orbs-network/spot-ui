"use client";
import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";

import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ExecutionPhase,
  Module,
  SpotProvider,
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
import { useUSDPrice } from "@/lib/hooks/use-usd-price";
import { Currency, SwapType } from "@/lib/types";
import { getWrappedNativeCurrency } from "@/lib/utils";
import { FormContainer } from "../form-container";
import { ToggleCurrencies } from "../toggle-currencies";
import { Button } from "../ui/button";
import { Portal } from "../ui/portal";
import { WrappedNativeButton } from "../wrapped-native-button";
import { SpotFooter } from "./footer";
import { OrderSettings } from "./order-settings";
import { SpotsOrders } from "./orders";
import { PriceSettings } from "./price-settings";
import {
  ClientErrorFallback,
  DisclaimerPanel,
  InputsErrorPanel,
} from "./spot-form-support";
import { SpotFormContextProvider } from "./spot-form-context";
import { SubmitOrderDialog } from "./submit-order-dialog";
import { TokenPanel } from "./token-panel";

const getModule = (swapType: SwapType): Module => {
  if (swapType === SwapType.SWAP) return Module.SWAP;
  if (swapType === SwapType.LIMIT) return Module.LIMIT;
  if (swapType === SwapType.STOP_LOSS) return Module.STOP_LOSS;
  if (swapType === SwapType.TAKE_PROFIT) return Module.TAKE_PROFIT;
  return Module.TWAP;
};

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
  const { isExecuting } = useExecution();
  const setPauseQuote = useSwapStore((state) => state.setPauseQuote);
  const queryClient = useQueryClient();

  useEffect(() => {
    setPauseQuote(isExecuting);
    if (isExecuting) {
      void queryClient.cancelQueries({ queryKey: SWAP_QUOTE_QUERY_KEY });
    }
    return () => setPauseQuote(false);
  }, [isExecuting, queryClient, setPauseQuote]);

  return null;
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
  const { isUnconfirmed, phase, resumeTracking } = useExecution();
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
          onClick={resumeTracking}
          disabled={isCheckingStatus}
          isLoading={isCheckingStatus}
        >
          {isCheckingStatus ? "Checking order status…" : "Check order status"}
        </Button>
      )}
    </div>
  );
};

export function SpotForm({ swapType }: { swapType: SwapType }) {
  const { inputCurrency, outputCurrency, inputAmount, wrappedNativeAction, quoteError, refetchTrade } =
    useDerivedSwap();
  const { setInputAmount } = useActionHandlers();
  const chainId = useActiveChainId();
  const { address } = useConnection();
  const { priceProtection: priceProtectionPercent } = useSettings();
  const swapModule = getModule(swapType);
  const contextValue = useMemo(
    () => ({ swapModule, setInputAmount }),
    [setInputAmount, swapModule],
  );
  const inputUsdPrice = useUSDPrice({ token: inputCurrency?.address });
  const outputUsdPrice = useUSDPrice({ token: outputCurrency?.address });
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
        <SpotProvider
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
          module={swapModule}
          inputTokenUsdPrice={inputUsdPrice.data.toString()}
          outputTokenUsdPrice={outputUsdPrice.data.toString()}
          marketQuote={marketQuote}
          minTradeSizeUsd={minTradeSizeUsd ?? 1}
          overrides={overrides}
          callbacks={callbacks}
          supportLegacyOrders={true}
          clientErrorFallback={ClientErrorFallback}
          displayFeePercent={swapModule === Module.SWAP ? 0 : 0.25}
        >
          <PauseQuotesDuringExecution />
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
                    {swapModule !== Module.SWAP && <PriceSettings />}
                    {swapModule !== Module.SWAP && <OrderSettings />}
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
              <SpotFooter />
            </>
          )}
        </SpotProvider>
      </FormContainer>
    </SpotFormContextProvider>
  );
}

export const SpotOrders = () => <div id="spot-orders" className="w-full" />;

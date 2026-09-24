"use client";
import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";

import { useMemo } from "react";
import {
  Module,
  SpotProvider,
  TimeUnit,
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

export function SpotForm({ swapType }: { swapType: SwapType }) {
  const { inputCurrency, outputCurrency, inputAmount, wrappedNativeAction } =
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
        {!supported ? (
          <p
            role="status"
            className="rounded-lg bg-muted p-4 text-sm text-muted-foreground"
          >
            {address
              ? `Choose a supported network in the navbar for ${partner}.`
              : `Connect your wallet, then choose a supported network for ${partner}.`}
          </p>
        ) : (
          <SpotProvider
            chainId={chainId}
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
            supportLegacyOrders
            clientErrorFallback={ClientErrorFallback}
            displayFeePercent={0.25}
          >
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
          </SpotProvider>
        )}
      </FormContainer>
    </SpotFormContextProvider>
  );
}

export const SpotOrders = () => <div id="spot-orders" className="w-full" />;

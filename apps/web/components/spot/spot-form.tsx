"use client";

import { useMemo } from "react";
import {
  Module,
  SpotProvider,
  type Token,
} from "@orbs-network/spot-react";
import { useConnection } from "wagmi";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useBalance } from "@/lib/hooks/use-balances";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useSettings } from "@/lib/hooks/use-settings";
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
  SpotChainSynchronizer,
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
  const {
    inputCurrency,
    outputCurrency,
    inputAmount,
    wrappedNativeAction,
  } = useDerivedSwap();
  const { setInputAmount } = useActionHandlers();
  const { chainId, address } = useConnection();
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
  const callbacks = useCallbacks();

  return (
    <SpotFormContextProvider value={contextValue}>
      <FormContainer>
        <SpotProvider
          chainId={chainId}
          inputAmountUi={inputAmount}
          walletInteractions={walletInteractions}
          account={address}
          partner={partner}
          appId="orbs-spot-ui"
          inputBalanceRaw={inputBalanceRaw}
          inputToken={inputToken}
          outputToken={outputToken}
          wrappedNativeToken={wrappedNativeToken}
          priceProtectionPercent={priceProtectionPercent}
          module={swapModule}
          inputTokenUsdPrice={inputUsdPrice.data.toString()}
          outputTokenUsdPrice={outputUsdPrice.data.toString()}
          marketQuote={marketQuote}
          minTradeSizeUsd={1}
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
        <SpotChainSynchronizer />
      </FormContainer>
    </SpotFormContextProvider>
  );
}

export const SpotOrders = () => (
  <div id="spot-orders" className="w-full" />
);

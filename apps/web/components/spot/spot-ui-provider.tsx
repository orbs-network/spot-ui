"use client";

import React, {
  createContext,
  useContext,
  useMemo,
} from "react";
import {
  Module,
  Partners,
  SpotProvider as Spot,
  TimeUnit,
  Token,
} from "@orbs-network/spot-react";
import { usePathname } from "next/navigation";
import { useBalance } from "@/lib/hooks/use-balances";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  SpotHooks,
  useSpotMarketReferencePrice,
  useWalletInteractions,
} from "@/lib/hooks/spot-hooks";
import { useActiveConnection } from "@/lib/hooks/use-active-connection";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { useUSDPrice } from "@/lib/hooks/use-usd-price";
import { Currency, SwapType } from "@/lib/types";

const { useCallbacks } = SpotHooks;

export const SPOT_DURATION_OPTIONS = [
  { label: "Minutes", text: "Minutes", value: TimeUnit.Minutes },
  { label: "Hours", text: "Hours", value: TimeUnit.Hours },
  { label: "Days", text: "Days", value: TimeUnit.Days },
];

export const getSpotModule = (swapType: SwapType) => {
  if (swapType === SwapType.TWAP) {
    return Module.TWAP;
  } else if (swapType === SwapType.LIMIT) {
    return Module.LIMIT;
  } else if (swapType === SwapType.STOP_LOSS) {
    return Module.STOP_LOSS;
  } else if (swapType === SwapType.TAKE_PROFIT) {
    return Module.TAKE_PROFIT;
  }

  return Module.TWAP;
};

const getSwapTypeFromPathname = (pathname: string, querySwapType: SwapType) => {
  if (pathname === "/limit") return SwapType.LIMIT;
  if (pathname === "/stop-loss") return SwapType.STOP_LOSS;
  if (pathname === "/take-profit") return SwapType.TAKE_PROFIT;
  if (pathname === "/twap") return SwapType.TWAP;
  if (pathname === "/") return querySwapType;

  return SwapType.TWAP;
};

const useParseSpotTokens = (currency?: Currency) => {
  return useMemo((): Token | undefined => {
    if (!currency) return undefined;

    return {
      address: currency.address,
      decimals: currency.decimals,
      symbol: currency.symbol,
      logoUrl: currency.logoUrl,
    };
  }, [currency]);
};

const SpotUiContext = createContext<{
  swapModule: Module;
}>({
  swapModule: Module.TWAP,
});

export const useSpotUiContext = () => useContext(SpotUiContext);

export const SpotUiProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const { inputCurrency, outputCurrency, inputAmount } = useDerivedSwap();
  const { chainId, swapType: querySwapType } = useSwapParams();
  const { address } = useActiveConnection();
  const { priceProtection: settingsPriceProtection } = useSettings();
  const inputUsd = useUSDPrice({ token: inputCurrency?.address });
  const outputUsd = useUSDPrice({ token: outputCurrency?.address });
  const { wei: inputBalance } = useBalance(inputCurrency);
  const { wei: outputBalance } = useBalance(outputCurrency);
  const callbacks = useCallbacks();
  const walletInteractions = useWalletInteractions();
  const swapType = getSwapTypeFromPathname(pathname, querySwapType);
  const swapModule = useMemo(() => getSpotModule(swapType), [swapType]);
  const enableOrderHistory = pathname !== "/";

  return (
    <SpotUiContext.Provider
      value={{
        swapModule,
      }}
    >
      <Spot
        account={address}
        callbacks={callbacks}
        chainId={chainId}
        dstBalance={outputBalance}
        dstToken={useParseSpotTokens(outputCurrency)}
        dstUsd1Token={outputUsd.data.toString()}
        enableOrderHistory={enableOrderHistory}
        fees={0.25}
        marketReferencePrice={useSpotMarketReferencePrice()}
        minChunkSizeUsd={5}
        module={swapModule}
        partner={Partners.Agent}
        priceProtection={settingsPriceProtection}
        srcBalance={inputBalance}
        srcToken={useParseSpotTokens(inputCurrency)}
        srcUsd1Token={inputUsd.data.toString()}
        typedInputAmount={inputAmount}
        walletInteractions={walletInteractions}
      >
        {children}
      </Spot>
    </SpotUiContext.Provider>
  );
};

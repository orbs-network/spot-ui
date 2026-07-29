import React, { createContext, useContext, useEffect, useMemo } from "react";
import { SpotDataProvider } from "./hooks/use-spot";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getConfig,
  Module,
  analytics,
  getPartnerChains,
  getMinChunkSizeUsd,
} from "@orbs-network/spot-ui";
import {
  SpotProps,
  SpotContextType,
  MarketReferencePrice,
} from "./types";
import { ErrorBoundary } from "react-error-boundary";
import { useSpotStore } from "./store";
import { useSwapExecution } from "./hooks/use-swap-execution";
import BN from "bignumber.js";
import { shouldUnwrapOnly, shouldWrapOnly, toAmountWei } from "./utils";

const SpotFallbackUI = () => {
  return (
    <div className="twap-error-fallback">
      <p
        style={{
          fontSize: 20,
          fontWeight: 600,
          textAlign: "center",
          width: "100%",
          marginTop: 40,
        }}
      >
        Something went wrong
      </p>
    </div>
  );
};

function ErrorWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={SpotFallbackUI}
      onError={(error) => analytics.onCrash(error)}
    >
      <>{children}</>
    </ErrorBoundary>
  );
}

export const SpotContext = createContext<SpotContextType | null>(null);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const Listeners = (props: SpotProps) => {
  const updateStore = useSpotStore((s) => s.updateState);
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);

  // update current time every minute, so the deadline will be updated when confirmation window is open
  useEffect(() => {
    const id = setInterval(() => {
      updateStore({ currentTime: Date.now() });
    }, 60_000);
    return () => clearInterval(id);
  }, [updateStore]);

  const overrideState = props.overrides?.state;
  const {
    isMarketOrder: isMarketOrderProp,
    chunks: overrideChunks,
    fillDelay: overrideFillDelay,
    duration: overrideDuration,
    limitPrice: overrideLimitPrice,
    triggerPrice: overrideTriggerPrice,
    triggerPricePercent: overrideTriggerPricePercent,
    limitPricePercent: overrideLimitPricePercent,
  } = overrideState ?? {};

  useEffect(() => {
    if (isMarketOrderProp !== undefined) {
      updateStore({ isMarketOrder: isMarketOrderProp });
    }

    updateStore({
      typedChunks: overrideChunks,
      typedFillDelay: overrideFillDelay,
      typedDuration: overrideDuration,
      typedLimitPrice: overrideLimitPrice,
      typedTriggerPrice: overrideTriggerPrice,
      triggerPricePercent: overrideTriggerPricePercent,
      limitPricePercent: overrideLimitPricePercent,
    });
    // Depend on the primitive override fields so an inline `overrides` object
    // literal does not refire this effect and wipe user-typed values.
  }, [
    updateStore,
    isMarketOrderProp,
    overrideChunks,
    overrideFillDelay,
    overrideDuration,
    overrideLimitPrice,
    overrideTriggerPrice,
    overrideTriggerPricePercent,
    overrideLimitPricePercent,
  ]);



  useEffect(() => {
    updateStore({
      typedLimitPrice: props.overrides?.state?.limitPrice,
      typedTriggerPrice: props.overrides?.state?.triggerPrice,
      triggerPricePercent: undefined,
      limitPricePercent: undefined,
    });
  }, [props.srcToken?.address, props.dstToken?.address]);

  useEffect(() => {
    if (props.module === Module.LIMIT) {
      updateStore({ isMarketOrder: false });
    }
  }, [props.module]);

  useEffect(() => {
    if (isMarketOrder) {
      updateStore({ isInvertedTrade: false });
    }
  }, [isMarketOrder]);


  useEffect(() => {
    updateStore({ typedChunks: undefined });
  }, [props.typedInputAmount])



  return null;
};

const useParsedMarketPrice = ({
  marketReferencePrice,
  srcToken,
  dstToken,
  chainId,
  typedInputAmount,
}: SpotProps) => {
  return useMemo((): MarketReferencePrice => {
    if (
      shouldWrapOnly(srcToken, dstToken, chainId) ||
      shouldUnwrapOnly(srcToken, dstToken, chainId)
    ) {
      return {
        isLoading: false,
        noLiquidity: false,
        value: toAmountWei(typedInputAmount || "0", srcToken?.decimals),
      };
    }
    if (
      BN(marketReferencePrice.value || 0).isZero() ||
      BN(typedInputAmount || 0).isZero()
    ) {
      return marketReferencePrice;
    }

    // Keep the per-token rate fractional. Rounding to whole dst-wei here
    // (.decimalPlaces(0)) skews the reference price for low-priced / low-decimal
    // pairs (e.g. a 12.5 wei/token rate → 13, a ~4% error) and that skew flows
    // into the limit-order min-out. Downstream converts to wei and rounds the
    // final amounts, so carrying full precision on the rate is strictly better.
    const value = BN(marketReferencePrice.value || 0)
      .dividedBy(typedInputAmount || 0)
      .toFixed();

    return {
      ...marketReferencePrice,
      value,
    };
  }, [marketReferencePrice, typedInputAmount, srcToken, dstToken, chainId]);
};



const Content = (props: SpotProps) => {
  const swapExecution = useSwapExecution();

  const supportedChains = useMemo(
    () => getPartnerChains(props.partner),
    [props.partner]
  );

  const chainId = useMemo(() => {
    const supportedChain = supportedChains[0] as number;
    if (!props.chainId) {
      return supportedChain;
    }
    return supportedChains.includes(props.chainId)
      ? props.chainId
      : supportedChain;
  }, [props.chainId, supportedChains]);

  const config = useMemo(
    () => getConfig(props.partner, chainId),
    [props.partner, chainId]
  );
  

  const marketReferencePrice = useParsedMarketPrice(props);
  const minChunkSizeUsd = useMemo(
    () => getMinChunkSizeUsd(props.minChunkSizeUsd),
    [props.minChunkSizeUsd]
  );

  useEffect(() => {
    analytics.init(config, minChunkSizeUsd, chainId, props.appId);
  }, [config, chainId, minChunkSizeUsd, props.appId]);


  const contextValue = useMemo(
    () => ({
      typedInputAmount: props.typedInputAmount,
      minChunkSizeUsd,
      account: props.account as `0x${string}` | undefined,
      walletInteractions: props.walletInteractions,
      marketPrice:
        swapExecution.acceptedMarketPrice || marketReferencePrice.value,
      marketPriceLoading:
        !swapExecution.acceptedMarketPrice && marketReferencePrice.isLoading,
      noLiquidity:
        !swapExecution.acceptedMarketPrice && marketReferencePrice.noLiquidity,
      config,
      slippage: props.priceProtection,
      supportedChains,
      chainId,
      partner: props.partner,
      module: props.module,
      fees: props.fees || 0,
      overrides: props.overrides,
      callbacks: props.callbacks,
      srcUsd1Token: props.srcUsd1Token,
      dstUsd1Token: props.dstUsd1Token,
      srcBalance: props.srcBalance,
      dstBalance: props.dstBalance,
      srcToken: swapExecution.srcToken || props.srcToken,
      dstToken: swapExecution.dstToken || props.dstToken,
      isDev: props.isDev,
    }),
    [
      props.typedInputAmount,
      minChunkSizeUsd,
      props.account,
      props.walletInteractions,
      swapExecution.acceptedMarketPrice,
      swapExecution.srcToken,
      swapExecution.dstToken,
      marketReferencePrice.value,
      marketReferencePrice.isLoading,
      marketReferencePrice.noLiquidity,
      config,
      props.priceProtection,
      supportedChains,
      chainId,
      props.partner,
      props.module,
      props.fees,
      props.overrides,
      props.callbacks,
      props.srcUsd1Token,
      props.dstUsd1Token,
      props.srcBalance,
      props.dstBalance,
      props.srcToken,
      props.dstToken,
      props.isDev,
    ]
  );

  return (
    <SpotContext.Provider value={contextValue}>
      <Listeners {...props} />
      <SpotDataProvider>
        <ErrorWrapper>{props.children}</ErrorWrapper>
      </SpotDataProvider>
    </SpotContext.Provider>
  );
};

export const SpotProvider = (props: SpotProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      <Content {...props} />
    </QueryClientProvider>
  );
};

export const useSpotContext = () => {
  const value = useContext(SpotContext);
  if (value === null) {
    throw new Error("useSpotContext must be used within SpotProvider");
  }
  return value;
};

import React, { createContext, useContext, useEffect, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getConfig,
  Module,
  getQueryParam,
  QUERY_PARAMS,
  amountBN,
  analytics,
  getPartnerChains,
} from "@orbs-network/spot-ui";
import {
  TwapProps,
  SpotContextType,
  MarketReferencePrice,
  Provider,
} from "./types";
import { ErrorBoundary } from "react-error-boundary";
import { useSpotStore } from "./store";
import BN from "bignumber.js";
import { shouldUnwrapOnly, shouldWrapOnly } from "./utils";
import * as chains from "viem/chains";
import { Chain } from "viem";
import { custom, createWalletClient, createPublicClient, http } from "viem";

import type { WalletClient, PublicClient } from "viem";

const initiateWallet = (chainId?: number, provider?: Provider) => {
  const chain = Object.values(chains).find((it: Chain) => it.id === chainId);

  if (!chain) {
    return {
      walletClient: undefined,
      publicClient: undefined,
    };
  }
  const transport = provider ? custom(provider) : undefined;
  const walletClient = transport
    ? (createWalletClient({ chain, transport }) as any)
    : undefined;
  const publicClient = createPublicClient({
    chain,
    transport: transport || http(),
  });

  return {
    walletClient: walletClient as WalletClient | undefined,
    publicClient: publicClient as PublicClient | undefined,
  };
};

const TwapFallbackUI = () => {
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
      FallbackComponent={TwapFallbackUI}
      onError={(error) => analytics.onCrash(error)}
    >
      <>{children}</>
    </ErrorBoundary>
  );
}

export const SpotContext = createContext({} as SpotContextType);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const Listeners = (props: TwapProps) => {
  const updateStore = useSpotStore((s) => s.updateState);
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  // update current time every minute, so the deadline will be updated when confirmation window is open
  useEffect(() => {
    setInterval(() => {
      updateStore({ currentTime: Date.now() });
    }, 60_000);
  }, [updateStore]);

  useEffect(() => {
    updateStore({
      isMarketOrder:
        props.module !== Module.LIMIT
          ? false
          : props.overrides?.state?.isMarketOrder,
      typedChunks: props.overrides?.state?.chunks,
      typedFillDelay: props.overrides?.state?.fillDelay,
      typedDuration: props.overrides?.state?.duration,
      typedLimitPrice: props.overrides?.state?.limitPrice,
      typedTriggerPrice: props.overrides?.state?.triggerPrice,
      triggerPricePercent: undefined,
      limitPricePercent: undefined,
    });
  }, [props.overrides?.state, props.module]);

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

  return null;
};

const useParsedMarketPrice = ({
  marketReferencePrice,
  srcToken,
  dstToken,
  chainId,
  typedInputAmount,
}: TwapProps) => {
  return useMemo((): MarketReferencePrice => {
    if (
      shouldWrapOnly(srcToken, dstToken, chainId) ||
      shouldUnwrapOnly(srcToken, dstToken, chainId)
    ) {
      return {
        isLoading: false,
        noLiquidity: false,
        value: amountBN(srcToken?.decimals || 18, typedInputAmount || "0"),
      };
    }
    if (
      BN(marketReferencePrice.value || 0).isZero() ||
      BN(typedInputAmount || 0).isZero()
    ) {
      return marketReferencePrice;
    }

    const value = BN(marketReferencePrice.value || 0)
      .dividedBy(typedInputAmount || 0)
      .toFixed();

    return {
      ...marketReferencePrice,
      value,
    };
  }, [marketReferencePrice, typedInputAmount, srcToken, dstToken, chainId]);
};

const getMinChunkSizeUsd = (minChunkSizeUsd: number) => {
  const minChunkSizeUsdFromQuery = getQueryParam(
    QUERY_PARAMS.MIN_CHUNK_SIZE_USD
  );
  if (minChunkSizeUsdFromQuery) {
    return parseInt(minChunkSizeUsdFromQuery);
  }
  return minChunkSizeUsd;
};

const Content = (props: TwapProps) => {
  const acceptedMarketPrice = useSpotStore((s) => s.state.acceptedMarketPrice);
  const { walletClient, publicClient } = useMemo(
    () => initiateWallet(props.chainId, props.provider),
    [props.chainId, props.provider]
  );

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
    analytics.init(config, minChunkSizeUsd, chainId);
  }, [config, chainId, minChunkSizeUsd]);

  return (
    <SpotContext.Provider
      value={{
        typedInputAmount: props.typedInputAmount,
        resetTypedInputAmount: props.resetTypedInputAmount,
        minChunkSizeUsd,
        account: props.account as `0x${string}` | undefined,
        walletClient,
        publicClient,
        marketPrice: acceptedMarketPrice || marketReferencePrice.value,
        marketPriceLoading:
          !acceptedMarketPrice && marketReferencePrice.isLoading,
        noLiquidity: !acceptedMarketPrice && marketReferencePrice.noLiquidity,
        config,
        slippage: props.priceProtection,
        supportedChains,
        chainId,
        partner: props.partner,
        module: props.module,
        fees: props.fees || 0,
        components: props.components,
        overrides: props.overrides,
        callbacks: props.callbacks,
        getTranslation: props.getTranslation,
        translations: props.translations,
        useToken: props.useToken,
        refetchBalances: props.refetchBalances,
        srcUsd1Token: props.srcUsd1Token,
        dstUsd1Token: props.dstUsd1Token,
        srcBalance: props.srcBalance,
        dstBalance: props.dstBalance,
        srcToken: props.srcToken,
        dstToken: props.dstToken,
      }}
    >
      <Listeners {...props} />
      <ErrorWrapper>{props.children}</ErrorWrapper>
    </SpotContext.Provider>
  );
};

export const SpotProvider = (props: TwapProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      <Content {...props} />
    </QueryClientProvider>
  );
};

export const useSpotContext = () => {
  if (!SpotContext) {
    throw new Error("useSpotContext must be used within a WidgetProvider");
  }
  return useContext(SpotContext);
};

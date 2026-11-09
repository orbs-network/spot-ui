import {
  eqIgnoreCase,
  isNativeAddress,
  toAmountRaw,
} from "@orbs-network/spot-ui";
import { useMemo } from "react";
import type { MarketQuote, SpotProps } from "../types";
import {
  createSpotFormDefaults,
  type SpotFormDefaults,
} from "./create-spot-store";
import type { SpotTradingState } from "./spot-trading-context";

interface SpotProviderState {
  initialState: SpotFormDefaults;
  formScopeKey: string;
  trading: SpotTradingState;
}

const resolveMarketQuote = (marketQuote: MarketQuote): MarketQuote => {
  if (marketQuote.isLoading) {
    return { isLoading: true, noLiquidity: marketQuote.noLiquidity };
  }
  const { quote } = marketQuote;
  // The original quote is authoritative; flat fields support other quote adapters.
  return {
    ...marketQuote,
    quotedOutputAmountRaw: quote?.netAmountOut ?? marketQuote.quotedOutputAmountRaw,
    minimumOutputAmountRaw: quote?.minimumAmountOut ?? marketQuote.minimumOutputAmountRaw,
    inputAmountUsd: quote?.inputAmountUsd ?? marketQuote.inputAmountUsd,
    quotedOutputAmountUsd: quote?.netAmountOutUsd ?? marketQuote.quotedOutputAmountUsd,
    minimumOutputAmountUsd: quote?.minimumAmountOutUsd ?? marketQuote.minimumOutputAmountUsd,
  };
};

export const useSpotProviderState = (props: SpotProps): SpotProviderState => {
  // The asynchronous client loader checks remote partner/chain support.
  const hasChainId =
    Number.isSafeInteger(props.chainId) && Number(props.chainId) > 0;
  const wrappedNativeAddress = props.wrappedNativeToken?.address;
  const {
    quote,
    quotedOutputAmountRaw: marketOutputAmountRaw,
    minimumOutputAmountRaw,
    inputAmountUsd,
    quotedOutputAmountUsd,
    minimumOutputAmountUsd,
  } = resolveMarketQuote(props.marketQuote);
  const isNativePair = Boolean(
    wrappedNativeAddress &&
      ((isNativeAddress(props.inputToken?.address) &&
        eqIgnoreCase(props.outputToken?.address || "", wrappedNativeAddress)) ||
        (eqIgnoreCase(props.inputToken?.address || "", wrappedNativeAddress) &&
          isNativeAddress(props.outputToken?.address))),
  );
  const quotedOutputAmountRaw = isNativePair
    ? toAmountRaw(props.inputAmountUi, props.outputToken?.decimals)
    : marketOutputAmountRaw;
  const marketPriceLoading = isNativePair
    ? false
    : props.marketQuote.isLoading;
  const noLiquidity = isNativePair
    ? false
    : props.marketQuote.noLiquidity;
  const initialState = useMemo(
    () =>
      createSpotFormDefaults({
        module: props.module,
        overrides: props.overrides,
      }),
    [props.module, props.overrides],
  );
  // Changing saved defaults must not reset the current form or execution.
  const formScopeKey = JSON.stringify([
    props.partner,
    props.chainId,
    props.module,
    props.inputToken?.address,
    props.inputToken?.decimals,
    props.outputToken?.address,
    props.outputToken?.decimals,
    props.wrappedNativeToken?.address,
    props.wrappedNativeToken?.decimals,
  ]);
  const trading = useMemo<SpotTradingState>(
    () => ({
      inputAmountUi: props.inputAmountUi,
      minTradeSizeUsd: props.minTradeSizeUsd,
      account: props.account,
      walletInteractions: props.walletInteractions,
      quote,
      quotedOutputAmountRaw,
      minimumOutputAmountRaw,
      inputAmountUsd,
      quotedOutputAmountUsd,
      minimumOutputAmountUsd,
      marketPriceLoading,
      noLiquidity,
      priceProtectionPercent: props.priceProtectionPercent,
      chainId: props.chainId,
      hasChainId,
      partner: props.partner,
      disableAnalytics: props.disableAnalytics ?? false,
      module: props.module,
      displayFeePercent: props.displayFeePercent ?? 0,
      callbacks: props.callbacks,
      inputTokenUsdPrice: props.inputTokenUsdPrice,
      outputTokenUsdPrice: props.outputTokenUsdPrice,
      inputBalanceRaw: props.inputBalanceRaw,
      inputToken: props.inputToken,
      outputToken: props.outputToken,
      wrappedNativeToken: props.wrappedNativeToken,
      supportLegacyOrders: props.supportLegacyOrders ?? false,
      overrides: props.overrides,
    }),
    [
      minimumOutputAmountRaw,
      inputAmountUsd,
      quotedOutputAmountUsd,
      minimumOutputAmountUsd,
      quote,
      props.account,
      props.callbacks,
      props.chainId,
      props.displayFeePercent,
      props.inputBalanceRaw,
      props.inputToken,
      props.inputTokenUsdPrice,
      props.minTradeSizeUsd,
      props.module,
      props.outputToken,
      props.outputTokenUsdPrice,
      props.wrappedNativeToken,
      props.overrides,
      props.partner,
      props.disableAnalytics,
      props.priceProtectionPercent,
      props.supportLegacyOrders,
      props.inputAmountUi,
      props.walletInteractions,
      hasChainId,
      marketPriceLoading,
      noLiquidity,
      quotedOutputAmountRaw,
    ],
  );

  return { initialState, formScopeKey, trading };
};

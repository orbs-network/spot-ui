import {
  eqIgnoreCase,
  isNativeAddress,
  toAmountRaw,
} from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { createSpotFormDefaults } from "../form/state";
import { FormDefaults as SpotFormDefaults } from "../form/types";
import type { SpotProps } from "./types";

import type { SpotTradingState } from "./trading-context";

interface SpotProviderState {
  initialState: SpotFormDefaults;
  formScopeKey: string;
  trading: SpotTradingState;
}

export const useSpotProviderState = (props: SpotProps): SpotProviderState => {
  // The asynchronous client loader checks remote partner/chain support.
  const hasChainId =
    Number.isSafeInteger(props.chainId) && Number(props.chainId) > 0;
  const wrappedNativeAddress = props.wrappedNativeToken?.address;
  const isNativePair = Boolean(
    wrappedNativeAddress &&
    ((isNativeAddress(props.inputToken?.address) &&
      eqIgnoreCase(props.outputToken?.address || "", wrappedNativeAddress)) ||
      (eqIgnoreCase(props.inputToken?.address || "", wrappedNativeAddress) &&
        isNativeAddress(props.outputToken?.address))),
  );
  const quotedOutputAmountRaw = isNativePair
    ? toAmountRaw(props.inputAmountUi, props.outputToken?.decimals)
    : props.marketQuote.isLoading
      ? undefined
      : props.marketQuote.quotedOutputAmountRaw;
  const marketPriceLoading = isNativePair ? false : props.marketQuote.isLoading;
  const noLiquidity = isNativePair ? false : props.marketQuote.noLiquidity;
  const initialState = useMemo(
    () =>
      createSpotFormDefaults({
        module: props.module,
        overrides: props.overrides,
      }),
    [props.module, props.overrides],
  );
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
    initialState,
  ]);
  const trading = useMemo<SpotTradingState>(
    () => ({
      inputAmountUi: props.inputAmountUi,
      minTradeSizeUsd: props.minTradeSizeUsd,
      account: props.account,
      walletInteractions: props.walletInteractions,
      quotedOutputAmountRaw,
      marketPriceLoading,
      noLiquidity,
      priceProtectionPercent: props.priceProtectionPercent,
      chainId: props.chainId,
      hasChainId,
      partner: props.partner,
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

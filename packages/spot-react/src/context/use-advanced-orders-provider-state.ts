import { eqIgnoreCase, isNativeAddress, toAmountRaw } from "@orbs-network/spot-ui/internal";
import { useMemo } from "react";
import type { AdvancedOrdersProviderProps } from "../types";
import {
  createSpotFormDefaults,
  type SpotFormDefaults,
} from "./create-spot-store";
import type { SpotTradingState } from "./spot-trading-context";

interface AdvancedOrdersProviderState {
  initialState: SpotFormDefaults;
  formScopeKey: string;
  trading: SpotTradingState;
}

export const useAdvancedOrdersProviderState = (props: AdvancedOrdersProviderProps): AdvancedOrdersProviderState => {
  // The asynchronous client loader checks remote partner/chain support.
  const hasChainId =
    Number.isSafeInteger(props.chainId) && Number(props.chainId) > 0;
  const wrappedNativeAddress = props.wrappedNativeToken?.address;
  const marketOutputAmountRaw = props.marketQuote.isLoading
    ? undefined
    : props.marketQuote.quotedOutputAmountRaw;
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
        orderType: props.orderType,
        overrides: props.overrides,
      }),
    [props.orderType, props.overrides],
  );
  // Changing saved defaults must not reset the current form or execution.
  const formScopeKey = JSON.stringify([
    props.partner,
    props.chainId,
    props.orderType,
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
      quotedOutputAmountRaw,
      marketPriceLoading,
      noLiquidity,
      priceProtectionPercent: props.priceProtectionPercent,
      chainId: props.chainId,
      hasChainId,
      partner: props.partner,
      disableAnalytics: props.disableAnalytics ?? false,
      orderType: props.orderType,
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
      props.orderType,
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

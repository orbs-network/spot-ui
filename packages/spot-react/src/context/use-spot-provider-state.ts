import {
  getPartnerChains,
  shouldUnwrapOnly,
  shouldWrapOnly,
  toAmountWei,
} from "@orbs-network/spot-ui";
import { useMemo } from "react";
import type { SpotProps } from "../types";
import {
  createSpotFormDefaults,
  type SpotFormDefaults,
  type SpotRuntimeState,
} from "./spot-store";

interface SpotProviderState {
  initialState: SpotFormDefaults;
  formScopeKey: string;
  runtime: SpotRuntimeState;
}

export const useSpotProviderState = (props: SpotProps): SpotProviderState => {
  const supportedChains = useMemo(
    () => getPartnerChains(props.partner),
    [props.partner],
  );
  const isSupportedChain = Boolean(
    props.chainId && supportedChains.includes(props.chainId),
  );
  const isNativePair =
    shouldWrapOnly(props.inputToken, props.outputToken, props.chainId) ||
    shouldUnwrapOnly(props.inputToken, props.outputToken, props.chainId);
  const marketPrice = isNativePair
    ? toAmountWei("1", props.outputToken?.decimals)
    : undefined;
  const quotedOutputAmount = isNativePair
    ? undefined
    : props.marketReferencePrice.value;
  const marketPriceLoading = isNativePair
    ? false
    : props.marketReferencePrice.isLoading;
  const noLiquidity = isNativePair
    ? false
    : props.marketReferencePrice.noLiquidity;
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
    initialState,
  ]);
  const runtime = useMemo<SpotRuntimeState>(
    () => ({
      typedInputAmount: props.typedInputAmount,
      minTradeSizeUsd: props.minTradeSizeUsd,
      account: props.account,
      walletInteractions: props.walletInteractions,
      marketPrice,
      quotedOutputAmount,
      marketPriceLoading,
      noLiquidity,
      priceProtection: props.priceProtection,
      chainId: props.chainId,
      isSupportedChain,
      partner: props.partner,
      module: props.module,
      displayFeePercent: props.displayFeePercent ?? 0,
      callbacks: props.callbacks,
      inputUsd1Token: props.inputUsd1Token,
      outputUsd1Token: props.outputUsd1Token,
      inputBalance: props.inputBalance,
      inputToken: props.inputToken,
      outputToken: props.outputToken,
      supportLegacyOrders: props.supportLegacyOrders ?? false,
      overrides: props.overrides,
    }),
    [
      props.account,
      props.callbacks,
      props.chainId,
      props.displayFeePercent,
      props.inputBalance,
      props.inputToken,
      props.inputUsd1Token,
      props.minTradeSizeUsd,
      props.module,
      props.outputToken,
      props.outputUsd1Token,
      props.overrides,
      props.partner,
      props.priceProtection,
      props.supportLegacyOrders,
      props.typedInputAmount,
      props.walletInteractions,
      isSupportedChain,
      marketPrice,
      marketPriceLoading,
      noLiquidity,
      quotedOutputAmount,
    ],
  );

  return { initialState, formScopeKey, runtime };
};

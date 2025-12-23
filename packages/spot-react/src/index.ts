import { useCallback } from "react";
import { setUIVersion } from "@orbs-network/spot-ui";
import { useTwapStore } from "./useTwapStore";
import pkg from "../package.json";
import { SpotProvider } from "./spot-context";
import { DISCLAIMER_URL, ORBS_LOGO, ORBS_WEBSITE_URL, DEFAULT_DURATION_OPTIONS } from "./consts";
import { Orders } from "./components/orders/orders";
import { useTradesPanel } from "./hooks/use-trades";
import { useFillDelayPanel } from "./hooks/use-fill-delay";
import { useMarketPricePanel } from "./hooks/use-market-price";
import { useDurationPanel } from "./hooks/use-duration";
import { useDisclaimerPanel } from "./hooks/use-disclaimer-panel";
import { useSubmitSwapPanel } from "./hooks/use-submit-swap-panel";
import { useTriggerPricePanel } from "./hooks/use-trigger-price";
import { useOrderHistoryPanel } from "./hooks/order-hooks";
import { useDstTokenPanel, useSrcTokenPanel } from "./hooks/use-token-panel";
import { useLimitPricePanel } from "./hooks/use-limit-price";
import { useInvertTradePanel } from "./hooks/use-invert-trade-panel";
import { useInputErrors } from "./hooks/use-input-errors";
import { useBuildRePermitOrderDataCallback } from "./hooks/use-build-repermit-order-data-callback";
import { useTogglePricePanel } from "./hooks/use-toggle-price";
import { SubmitOrderPanel } from "./components/submit-order-panel";
export * from "./types";
export * from "./utils";
export { Configs, PRICE_PROTECTION_SETTINGS } from "./consts";
export { useFormatNumber } from "./hooks/helper-hooks";

// Set the UI version in spot-sdk for analytics
setUIVersion(pkg.version);



const useTypedSrcAmount = () => {
  const updateState = useTwapStore((s) => s.updateState);

  return {
    amount: useTwapStore((s) => s.state.typedSrcAmount),
    reset: useCallback(() => updateState({ typedSrcAmount: "" }), [updateState]),
  };
};


const Components = {
  SubmitOrderPanel,
  Orders,
};


export * from "@orbs-network/spot-ui";


export {
  SpotProvider,
  ORBS_WEBSITE_URL,
  ORBS_LOGO,
  DEFAULT_DURATION_OPTIONS,
  DISCLAIMER_URL,
  Components,
  useTradesPanel,
  useDurationPanel,
  useFillDelayPanel,
  useLimitPricePanel,
  useMarketPricePanel,
  useSrcTokenPanel,
  useDstTokenPanel,
  useTriggerPricePanel,
  useOrderHistoryPanel,
  useSubmitSwapPanel,
  useDisclaimerPanel,
  useInvertTradePanel,
  useInputErrors,
  useTogglePricePanel,
  useBuildRePermitOrderDataCallback,
  useTypedSrcAmount
};

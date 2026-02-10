
import { setUIVersion } from "@orbs-network/spot-ui";
import pkg from "../package.json";
import { SpotProvider } from "./spot-context";
import { DEFAULT_DURATION_OPTIONS } from "./consts";
import { Orders } from "./components/orders/orders";
import { useTradesPanel } from "./hooks/use-trades";
import { useFillDelayPanel } from "./hooks/use-fill-delay";
import { useDurationPanel } from "./hooks/use-duration";
import { useDisclaimerPanel } from "./hooks/use-disclaimer-panel";
import { useTriggerPricePanel } from "./hooks/use-trigger-price-panel";
import { useOrderHistoryPanel } from "./hooks/order-hooks";
import { useDstTokenPanel } from "./hooks/use-dst-token-panel";
import { useLimitPricePanel } from "./hooks/use-limit-price-panel";
import { useInvertTradePanel } from "./hooks/use-invert-trade-panel";
import { useInputErrors } from "./hooks/use-input-errors";
import { useTogglePricePanel } from "./hooks/use-toggle-price";
import { SubmitOrderPanel } from "./components/submit-order-panel";
import { useTranslations } from "./hooks/use-translations";
import { usePartnerChains } from "./hooks/use-partner-chains";
import { useAddresses } from "./hooks/use-addresses";
import { useSubmitOrderButton, useSubmitOrderPanel } from "./hooks/use-submit-order-panel";
export * from "./types";
export * from "./utils";
export { PRICE_PROTECTION_SETTINGS } from "./consts";
export { useFormatNumber } from "./hooks/helper-hooks";
import { useOrder, useOrderInfo } from "./hooks/use-order";
import { Portal } from "./components/portal";

// Set the UI version in spot-sdk for analytics
setUIVersion(pkg.version);




const Components = {
  SubmitOrderPanel,
  Orders,
  Portal
};


export * from "@orbs-network/spot-ui";


export {
  SpotProvider,
  DEFAULT_DURATION_OPTIONS,
  Components,
  useTradesPanel,
  useDurationPanel,
  useFillDelayPanel,
  useLimitPricePanel,
  useDstTokenPanel,
  useTriggerPricePanel,
  useOrderHistoryPanel,
  useSubmitOrderPanel,
  useDisclaimerPanel,
  useInvertTradePanel,
  useInputErrors,
  useTogglePricePanel,
  useTranslations,
  usePartnerChains,
  useAddresses,
  useSubmitOrderButton,
  useOrder,
  useOrderInfo,
};

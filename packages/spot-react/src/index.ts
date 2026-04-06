
import { setUIVersion } from "@orbs-network/spot-ui";
import pkg from "../package.json";
import { SpotProvider } from "./spot-context";
import { DEFAULT_DURATIONS } from "./consts";
import { useTradesPanel } from "./hooks/use-trades";
import { useFillDelayPanel } from "./hooks/use-fill-delay";
import { useDurationPanel } from "./hooks/use-duration";
import { useDisclaimerPanel } from "./hooks/use-disclaimer-panel";
import { useTriggerPricePanel } from "./hooks/use-trigger-price-panel";
import { useOrderHistoryPanel } from "./hooks/order-hooks";
import { useDerivedHistoryOrder } from "./hooks/use-history-order";
import { useDstTokenPanel } from "./hooks/use-dst-token-panel";
import { useLimitPricePanel } from "./hooks/use-limit-price-panel";
import { useInvertTradePanel } from "./hooks/use-invert-trade-panel";
import { useInputErrors } from "./hooks/use-input-errors";
import { usePartnerChains } from "./hooks/use-partner-chains";
import { useAddresses } from "./hooks/use-addresses";
import { useSubmitOrderButton, useSubmitOrderPanel } from "./hooks/use-submit-order-panel";
export * from "./types";
export * from "./utils";
export { useFormatNumber, useAmountUi, useDateFormat, useExplorerLink, useCopyToClipboard, useNetwork } from "./hooks/helper-hooks";
export { useSwapExecution } from "./hooks/use-swap-execution";
import { useDerivedOrder } from "./hooks/use-order";
import { useSignOrder, useSubmitOrderMutation } from "./hooks/use-submit-order";
import { useCancelOrderRefetchUntilStatusSynced, useCancelOrderMutation } from "./hooks/use-cancel-order";

// Set the UI version in spot-sdk for analytics
setUIVersion(pkg.version);


// Re-export public API from spot-ui (explicit, not wildcard)
export {
  // Types
  type Config,
  type SpotConfig,
  type TimeDuration,
  type PartnerPayloadItem,
  type RePermitOrder,
  type Signature,
  type Address,
  type Hex,
  type InputError,

  // Enums
  Module,
  OrderStatus,
  OrderFilter,
  OrderType,
  TimeUnit,
  Partners,
  InputErrors,

  // Functions
  getConfig,
  getPartners,
  getMinChunkSizeUsd,
  buildRePermitOrderData,
  submitOrder,
  getNetwork,
  getPartnerChains,
  isNativeAddress,
  eqIgnoreCase,
  getOrderExecutionRate,
  getOrderLimitPriceRate,
  getOrderFillDelayMillis,
  getTriggerPriceRate,

  // Constants
  SPOT_VERSION,
  DISCLAIMER_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_SLTP_FAQ_URL,
  ORBS_LOGO,
  ORBS_WEBSITE_URL,
  networks,

  // ABIs
  IWETH_ABI,
  ERC20_ABI,
  REPERMIT_ABI,
  TWAP_ABI,

  // Analytics
} from "@orbs-network/spot-ui";


export {
  SpotProvider,
  DEFAULT_DURATIONS,
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
  usePartnerChains,
  useAddresses,
  useSubmitOrderButton,
  useDerivedOrder,
  useCancelOrderRefetchUntilStatusSynced,
  useDerivedHistoryOrder,
  useSubmitOrderMutation,
  useCancelOrderMutation,
  useSignOrder,
};

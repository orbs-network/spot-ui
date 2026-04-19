
import { setUIVersion } from "@orbs-network/spot-ui";
import pkg from "../package.json";
import { SpotProvider } from "./spot-context";
import { useDerivedHistoryOrder } from "./hooks/use-history-order";
import { useSpot } from "./hooks/use-spot";
import { useCancelOrder } from "./hooks/use-cancel-order";
import { useSignOrder, useSubmitOrderMutation } from "./hooks/use-submit-order";
export * from "./types";
export * from "./utils";
export { useAmountUi, useExplorerLink, useNetwork } from "./hooks/helper-hooks";
export { useSwapExecution } from "./hooks/use-swap-execution";
export { type CancelOrderStatus } from "./hooks/use-cancel-order";

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

  // Analytics
} from "@orbs-network/spot-ui";


export {
  SpotProvider,
  useSpot,
  useDerivedHistoryOrder,
  useCancelOrder,
  useSignOrder,
  useSubmitOrderMutation as useSubmitOrder
};


import { setUIVersion } from "@orbs-network/spot-ui";
import pkg from "../package.json";
import { SpotProvider } from "./spot-context";
import { useDerivedHistoryOrder } from "./hooks/use-history-order";
import { useSpot } from "./hooks/use-spot";
export * from "./types";
export * from "./utils";
export { useAmountUi, useExplorerLink, useNetwork } from "./hooks/helper-hooks";
export { useSwapExecution } from "./hooks/use-swap-execution";

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
  useSpot,
  useDerivedHistoryOrder,
};

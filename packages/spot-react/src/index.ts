import { setUIVersion } from "@orbs-network/spot-ui";
import pkg from "../package.json";
import { SpotProvider } from "./context/spot-provider";
export * from "./types";
export { useOrderForm } from "./context/order-form-context";
export { useClient } from "./context/use-client";
export { useAmountUi } from "./hooks/helper-hooks";
export { useOrders } from "./hooks/order-hooks";
export { useCancelOrder } from "./hooks/use-cancel-order";
export { useDisclaimer } from "./hooks/use-disclaimer";
export { useDuration } from "./hooks/use-duration";
export { useFillDelay } from "./hooks/use-fill-delay";
export { useHistoryOrder } from "./hooks/use-history-order";
export { useInputErrors } from "./hooks/use-input-errors";
export { useLimitPrice } from "./hooks/use-limit-price";
export { useOutputAmount } from "./hooks/use-output-amount";
export { usePriceDisplay } from "./hooks/use-price-display";
export { useExecution, useSubmitButton } from "./hooks/use-execution";
export { useTrades } from "./hooks/use-trades";
export { useTriggerPrice } from "./hooks/use-trigger-price";
export { type CancelOrderStatus } from "./hooks/use-cancel-order";
export type { SpotExecutionData } from "./hooks/use-execution";

// Set the UI version in spot-sdk for analytics
setUIVersion(pkg.version);

// Re-export public API from spot-ui (explicit, not wildcard)
export {
  // Types
  type Config,
  type TimeDuration,
  type PartnerPayloadItem,
  type RePermitData,
  type RePermitOrder,
  type SpotClient,
  type PrepareOrderParams,
  type PreparedOrder,
  type PreparedOrderValues,
  type Eip712TypedData,
  type OrderSigningRequest,
  type ApprovalRequest,
  type AllowanceRequest,
  type CancelOrderRequest,
  type ClientGetAccountOrdersParams,
  type Signature,
  type Address,
  type Hex,
  type InputError,
  type CalculateOrderFormParams,
  type CalculatedAmount,
  type CalculatedOrderInputAmount,
  type CalculatedMarketPriceValues,
  type CalculatedOrderTrades,
  type CalculatedOrderFees,
  type CalculatedOrderFormSchedule,
  type CalculatedOrderFormErrors,
  type CalculatedOrderForm,
  type CalculatedOrderSchedule,
  type CalculatedPriceInput,
  type CalculatedPriceDisplay,
  type CalculatedTriggerPriceValues,
  type CalculatedLimitPriceValues,
  type CalculatedOrderValues,

  // Enums
  Module,
  OrderStatus,
  OrderFilter,
  OrderType,
  TimeUnit,
  Partners,
  InputErrors,

  // Functions
  getPartners,
  getTwapConfig,
  calculateOrderForm,
  toAmountRaw,
  toAmountUI,
  invertPriceInput,
  createClient,
  getPartnerChains,
  isNativeAddress,
  eqIgnoreCase,
  getOrderExecutionRate,
  getOrderLimitPriceRate,
  getOrderFillDelayMillis,
  getTriggerPriceRate,
  isTxRejected,

  // Constants
  SPOT_VERSION,
  DISCLAIMER_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_SLTP_FAQ_URL,
  ORBS_LOGO,
  ORBS_WEBSITE_URL,
  // Analytics
} from "@orbs-network/spot-ui";

export { SpotProvider };

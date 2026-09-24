import { SpotProvider } from "./provider/spot-provider";
export { ExecutionPhase, ExecutionStatus, Steps } from "@orbs-network/spot-ui";
export type {
  ApproveTokenProps,
  CancelOrderProps,
  CompletedWrap,
  GetAllowanceProps,
  ObserverResult,
  OnApproveSuccessCallback,
  OnWrapSuccessCallback,
  Order,
  OrderFill,
  ParsedError,
  StartedSwapExecution,
  SwapExecution,
  Token,
  WalletInteractions,
} from "@orbs-network/spot-ui";
export type { OnCancelOrderSuccess } from "./cancellation/types";
export {
  useCancelOrder,
  type CancelOrderStatus,
} from "./cancellation/use-cancel-order";
export { useClient } from "./client/use-client";
export { useExecution, useSubmitButton } from "./execution/use-execution";
export type { SpotExecutionData } from "./execution/use-execution";
export { useOrderForm } from "./form/form-context";
export { useAmountUi } from "./form/hooks/use-amount-ui";
export { useDisclaimer } from "./form/hooks/use-disclaimer";
export { useDuration } from "./form/hooks/use-duration";
export { useFillDelay } from "./form/hooks/use-fill-delay";
export { useInputErrors } from "./form/hooks/use-input-errors";
export { useLimitPrice } from "./form/hooks/use-limit-price";
export { useOutputAmount } from "./form/hooks/use-output-amount";
export { usePriceDisplay } from "./form/hooks/use-price-display";
export { useTrades } from "./form/hooks/use-trades";
export { useTriggerPrice } from "./form/hooks/use-trigger-price";
export { Disclaimer } from "./form/types";
export type { InitialState, MarketQuote, Overrides } from "./form/types";
export { useHistoryOrder } from "./history/use-history-order";
export { useOrders } from "./history/use-orders";
export type { Callbacks } from "./provider/callbacks";
export type {
  ClientErrorFallbackProps,
  SpotErrorFallbackProps,
  SpotProps,
} from "./provider/types";
export type { State } from "./store/types";

// Re-export public API from spot-ui (explicit, not wildcard)
export {
  calculateOrderForm,
  createClient,
  // Constants
  DISCLAIMER_URL,
  eqIgnoreCase,
  getOrderExecutionRate,
  getOrderFillDelayMillis,
  getOrderLimitPriceRate,
  getTriggerPriceRate,
  // Functions
  getTwapConfig,
  InputErrors,
  invertPriceInput,
  isNativeAddress,
  isTxRejected,
  // Enums
  Module,
  ORBS_LOGO,
  ORBS_SLTP_FAQ_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_WEBSITE_URL,
  OrderFilter,
  OrderStatus,
  OrderType,
  Partners,
  TimeUnit,
  toAmountRaw,
  toAmountUI,
  type AccountOrdersResult,
  type Address,
  type AllowanceRequest,
  type ApprovalRequest,
  type CalculatedAmount,
  type CalculatedLimitPriceValues,
  type CalculatedMarketPriceValues,
  type CalculatedOrderFees,
  type CalculatedOrderForm,
  type CalculatedOrderFormErrors,
  type CalculatedOrderFormSchedule,
  type CalculatedOrderInputAmount,
  type CalculatedOrderSchedule,
  type CalculatedOrderTrades,
  type CalculatedOrderValues,
  type CalculatedPriceDisplay,
  type CalculatedPriceInput,
  type CalculatedTriggerPriceValues,
  type CalculateOrderFormParams,
  type CancelOrderRequest,
  type ClientGetAccountOrdersParams,
  // Types
  type Config,
  type Eip712TypedData,
  type Hex,
  type InputError,
  type OrderSigningRequest,
  type PreparedOrder,
  type PreparedOrderValues,
  type PrepareOrderParams,
  type RePermitData,
  type RePermitOrder,
  type Signature,
  type SpotAnalytics,
  type SpotClient,
  type TimeDuration,
} from "@orbs-network/spot-ui";

export { SpotProvider };

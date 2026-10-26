"use client";

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
  type RePermitData,
  type RePermitOrder,
  type SpotClient,
  type CreateClientOptions,
  type SpotAnalytics,
  type AccountOrdersResult,
  type GetOrdersParams,
  type QuoteErrorKind,
  type SwapQuote,
  type SwapQuoteParams,
  type PrepareSwapParams,
  type PreparedSwap,
  type SubmitSwapParams,
  type SubmittedSwap,
  type SwapTradeType,
  type ExecuteOrderParams,
  type OrderExecutionUpdate,
  type OrderExecutionPhase,
  type OrderExecutionStep,
  type OrderWalletInteractions,
  type SignableOrder,
  type WaitForOrderParams,
  type PrepareOrderParams,
  type PreparedOrder,
  type PreparedOrderValues,
  type Eip712TypedData,
  type OrderSigningRequest,
  type ApprovalRequest,
  type AllowanceRequest,
  type CancelOrderRequest,
  type ClientGetAccountOrdersParams,
  type ClientGetOrderParams,
  type ClientGetQuoteParams,
  type SpotErrorCode,
  type SpotErrorOptions,
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
  getQuote,
  isQuoteFresh,
  getMinimumOutputAmount,
  isSwapSupported,
  submitSwap,
  executeOrder,
  waitForOrder,
  watchOrder,
  getOrders,
  getTwapConfig,
  calculateOrder,
  calculateOrderForm,
  toAmountRaw,
  toAmountUI,
  invertPriceInput,
  createClient,
  isNativeAddress,
  eqIgnoreCase,
  getOrderExecutionRate,
  getOrderLimitPriceRate,
  getOrderFillDelayMillis,
  getTriggerPriceRate,
  isTxRejected,

  // Errors
  QuoteError,
  SpotError,
  OrderSettlementError,

  // Constants
  SWAP_CAPABILITIES,
  DISCLAIMER_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_SLTP_FAQ_URL,
  ORBS_LOGO,
  ORBS_WEBSITE_URL,
  // Analytics
  analytics,
  setUIVersion,
} from "@orbs-network/spot-ui";

export { SpotProvider };

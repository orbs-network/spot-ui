"use client";

import { setUIVersion } from "@orbs-network/spot-ui/internal";
import pkg from "../package.json";
import { AdvancedOrdersProvider } from "./context/advanced-orders-provider";
export {
  ExecutionStatus,
  ExecutionPhase,
  Disclaimer,
  Steps,
  type Order,
  type Token,
  type OrderFill,
  type CancelOrderProps,
  type ApproveTokenProps,
  type WalletInteractions,
  type GetAllowanceProps,
  type InitialState,
  type Overrides,
  type OnApproveSuccessCallback,
  type OnWrapSuccessCallback,
  type OnCancelOrderSuccess,
  type ParsedError,
  type ObserverResult,
  type Callbacks,
  type MarketQuote,
  type ClientErrorFallbackProps,
  type SpotErrorFallbackProps,
  type AdvancedOrdersProviderProps,
  type AdvancedOrderModule,
} from "./types";
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
export type { SubmitButtonResult, SubmitDisabledReason } from "./hooks/use-execution";

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
  type SubmitOrderOptions,
  type AccountOrdersResult,
  type GetOrdersParams,
  type QuoteErrorKind,
  type SwapQuote,
  type SwapQuoteParams,
  type PrepareSwapParams,
  type PreparedSwap,
  type ExecuteSwapParams,
  type CompletedSwap,
  type SwapTradeType,
  type ExecuteOrderParams,
  type ExecutedOrder,
  type ResumeOrderParams,
  type OrderWalletInteractions,
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
  type OrderFormNotReadyReason,
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
  isSwapSupported,
  getOrders,
  calculateOrder,
  calculateOrderForm,
  invertPriceInput,
  createClient,
  getOrderExecutionRate,
  getOrderLimitPriceRate,
  getOrderFillDelayMillis,
  getTriggerPriceRate,

  // Errors
  QuoteError,
  SpotError,
  OrderSettlementError,

  // Constants
  DISCLAIMER_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_SLTP_FAQ_URL,
  ORBS_LOGO,
  ORBS_WEBSITE_URL,
} from "@orbs-network/spot-ui";

export { AdvancedOrdersProvider };

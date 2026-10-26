export {
  Module,
  OrderStatus,
  OrderFilter,
  TimeUnit,
  OrderType,
  Partners,
  InputErrors,
  type Config,
  type TimeDuration,
  type OrderFill,
  type Order,
  type Address,
  type Hex,
  type RePermitOrder,
  type RePermitData,
  type Signature,
  type InputError,
  type Token,
} from "./lib/types";

export {
  toAmountRaw,
  toAmountUI,
} from "./lib/order-form/amounts";

export { invertPriceInput } from "./lib/order-form/prices";

export type {
  CalculateOrderFormParams,
  CalculatedAmount,
  CalculatedOrderInputAmount,
  CalculatedMarketPriceValues,
  CalculatedOrderTrades,
  CalculatedOrderFees,
  CalculatedOrderFormSchedule,
  CalculatedOrderFormErrors,
  CalculatedOrderForm,
} from "./lib/order-form/types";

export { calculateOrder, calculateOrderForm } from "./lib/order-form/calculate-order-form";

export type {
  CalculatedOrderSchedule,
  CalculatedPriceInput,
  CalculatedPriceDisplay,
  CalculatedTriggerPriceValues,
  CalculatedLimitPriceValues,
  CalculatedOrderValues,
} from "./lib/order-form/types";

export {
  createClient,
  type CreateClientOptions,
  type SpotClient,
  type PrepareOrderParams,
  type Eip712TypedData,
  type OrderSigningRequest,
  type ApprovalRequest,
  type AllowanceRequest,
  type PreparedOrderValues,
  type PreparedOrder,
  type CancelOrderRequest,
  type ClientGetAccountOrdersParams,
  type ClientGetOrderParams,
  type ClientGetQuoteParams,
} from "./lib/client";

export { SpotError, type SpotErrorCode, type SpotErrorOptions } from "./lib/errors";

export { getTwapConfig } from "./lib/orders/legacy-twap-config";

export {
  DISCLAIMER_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_SLTP_FAQ_URL,
  ORBS_LOGO,
  ORBS_WEBSITE_URL,
} from "./lib/public-links";

export { getOrders, type GetOrdersParams, type AccountOrdersResult } from "./lib/orders";

export { analytics, setUIVersion, type SpotAnalytics } from "./lib/analytics";

export {
  isNativeAddress,
  eqIgnoreCase,
  getOrderFillDelayMillis,
  getOrderExecutionRate,
  getOrderLimitPriceRate,
  getTriggerPriceRate,
  isTxRejected,
} from "./lib/utils";

export { getQuote, isQuoteFresh, QuoteError, type QuoteErrorKind, type SwapQuote, type SwapQuoteParams } from "./lib/quote";

export { getMinimumOutputAmount } from "./lib/swap-amounts";
export { SWAP_CAPABILITIES, isSwapSupported, submitSwap, type PrepareSwapParams, type PreparedSwap, type SubmitSwapParams, type SubmittedSwap, type SwapTradeType } from "./lib/swap";
export { executeOrder, type ExecuteOrderParams, type OrderExecutionUpdate, type OrderExecutionPhase, type OrderExecutionStep, type OrderWalletInteractions, type SignableOrder } from "./lib/execute-order";
export { waitForOrder, watchOrder, OrderSettlementError, type WaitForOrderParams } from "./lib/wait-for-order";

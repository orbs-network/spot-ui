export {
  OrderType,
  OrderStatus,
  OrderFilter,
  TimeUnit,
  OrderVariant,
  Partners,
  InputErrors,
  type DeepReadonly,
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
  OrderFormNotReadyReason,
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
  type Eip712TypedData,
  type OrderSigningRequest,
  type ApprovalRequest,
  type PreparedOrderValues,
  type PreparedOrder,
  type PrepareOrderParams,
  type PrepareSwapParams,
  type SubmitOrderOptions,
  type SubmitSwapOptions,
  type CancelOrderRequest,
  type ClientGetOrdersParams,
  type ClientGetOrderParams,
  type ClientGetQuoteParams,
} from "./lib/client";

export { SpotError, type SpotErrorCode, type SpotErrorOptions } from "./lib/errors";

export {
  DISCLAIMER_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_SLTP_FAQ_URL,
  ORBS_LOGO,
  ORBS_WEBSITE_URL,
} from "./lib/public-links";

export { getOrders, type GetOrdersParams, type AccountOrdersResult } from "./lib/orders";

export {
  getOrderFillDelayMillis,
  getOrderExecutionRate,
  getOrderLimitPriceRate,
  getTriggerPriceRate,
} from "./lib/utils";

export { getQuote, isQuoteFresh, QuoteError, type QuoteErrorKind, type SwapQuote, type SwapQuoteParams } from "./lib/quote";

export { isSwapSupported, type PreparedSwap, type SwapTradeType } from "./lib/swap";

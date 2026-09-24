export { Partners } from "./config/partners";
export { type RePermitData } from "./config/types";
export { type RePermitOrder } from "./contracts/types";
export { type Config } from "./history/legacy/types";
export { InputErrors, type InputError } from "./order-form/errors";
export {
  OrderFilter,
  OrderStatus,
  OrderType,
  type Order,
  type OrderFill,
} from "./orders/types";
export { TimeUnit, type TimeDuration } from "./shared/time";
export {
  Module,
  type Address,
  type Hex,
  type Signature,
  type Token,
} from "./shared/types";

export { toAmountRaw, toAmountUI } from "./order-form/amounts";

export { invertPriceInput } from "./order-form/prices";

export type {
  CalculateOrderFormParams,
  CalculatedAmount,
  CalculatedMarketPriceValues,
  CalculatedOrderFees,
  CalculatedOrderForm,
  CalculatedOrderFormErrors,
  CalculatedOrderFormSchedule,
  CalculatedOrderInputAmount,
  CalculatedOrderTrades,
} from "./order-form/types";

export { calculateOrderForm } from "./order-form/calculate-order-form";

export type {
  CalculatedLimitPriceValues,
  CalculatedOrderSchedule,
  CalculatedOrderValues,
  CalculatedPriceDisplay,
  CalculatedPriceInput,
  CalculatedTriggerPriceValues,
} from "./order-form/types";

export { createClient } from "./client/create-client";
export {
  type AllowanceRequest,
  type ApprovalRequest,
  type CancelOrderRequest,
  type ClientGetAccountOrdersParams,
  type Eip712TypedData,
  type OrderSigningRequest,
  type PrepareOrderParams,
  type PreparedOrder,
  type PreparedOrderValues,
  type SpotClient,
} from "./client/types";

export { getTwapConfig } from "./history/legacy/deployments";

export {
  DISCLAIMER_URL,
  ORBS_LOGO,
  ORBS_SLTP_FAQ_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_WEBSITE_URL,
} from "./shared/public-links";

export type { AccountOrdersResult } from "./history/get-account-orders";

export {
  analytics,
  setUIVersion,
  type AnalyticsOptions,
  type SpotAnalytics,
} from "./analytics/analytics";

export {
  getOrderExecutionRate,
  getOrderFillDelayMillis,
  getOrderLimitPriceRate,
  getTriggerPriceRate,
} from "./orders/metrics";
export { eqIgnoreCase, isNativeAddress } from "./shared/addresses";
export { isTxRejected } from "./shared/errors";

export type { ExecutionCallbacks } from "./execution/callbacks";
export {
  executeOrder,
  type ExecuteOrderParams,
  type ExecutionController,
} from "./execution/execute-order";
export {
  canBeginExecution,
  canTransitionExecution,
  createIdleExecution,
  getErrorMessage,
  getExecutionStatus,
  getExecutionStep,
  getReusableCompletedWrap,
  isExecutionActive,
  normalizeError,
  observe,
  parseExecutionError,
} from "./execution/execution-state";
export {
  ExecutionPhase,
  ExecutionStatus,
  Steps,
  type CompletedWrap,
  type ObserverResult,
  type OnApproveSuccessCallback,
  type OnWrapSuccessCallback,
  type ParsedError,
  type StartedSwapExecution,
  type SwapExecution,
} from "./execution/types";
export type {
  ApproveTokenProps,
  CancelOrderProps,
  GetAllowanceProps,
  WalletInteractions,
} from "./execution/wallet";

export {
  createExecutionController,
  type ExecutionStateBinding,
} from "./execution/controller";

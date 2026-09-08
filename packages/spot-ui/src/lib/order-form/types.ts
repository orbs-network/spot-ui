import type {
  InputError,
  Module,
  OrderType,
  TimeDuration,
} from "../types";

export interface CalculateOrderFormParams {
  module: Module;
  inputTokenDecimals: number;
  outputTokenDecimals: number;
  /** Raw output-token quote for the complete `userInput.inputAmountUi`. */
  quotedOutputAmountRaw?: string;
  inputTokenUsdPrice?: string;
  outputTokenUsdPrice?: string;
  minTradeSizeUsd: number;
  priceProtectionPercent: number;
  /** Display-only estimate; fee collection is configured outside the SDK. */
  displayFeePercent?: number;
  inputBalanceRaw?: string;
  /** Values controlled by the order form's user-facing inputs. */
  userInput: {
    /** User-entered decimal amount, for example `"1.5"`. */
    inputAmountUi: string;
    isMarketOrder: boolean;
    tradeCount?: number;
    tradeInterval?: TimeDuration;
    orderDuration?: TimeDuration;
    limitPriceUi?: string;
    limitPricePercent?: string | null;
    triggerPriceUi?: string;
    triggerPricePercent?: string | null;
    isPriceInverted?: boolean;
  };
}

export interface CalculatedAmount {
  raw: string;
  ui: string;
  usd: string;
}

export interface CalculatedOrderInputAmount extends CalculatedAmount {
  isEmpty: boolean;
}

export interface CalculatedMarketPriceValues {
  raw: string;
  ui: string;
  usd: string;
}

export interface CalculatedOrderSchedule {
  totalTrades: number;
  fillDelay: TimeDuration;
  fillDelayMillis: number;
  duration: TimeDuration;
  durationMillis: number;
}

export interface CalculatedPriceInput {
  raw: string;
  typedValue?: string;
  percentage: string;
  isTypedValue: boolean;
}

export interface CalculatedPriceDisplay {
  raw: string;
  ui: string;
  usd: string;
}

export interface CalculatedTriggerPriceValues extends CalculatedPriceInput {
  enabled: boolean;
  display: CalculatedPriceDisplay;
  error?: InputError;
}

export interface CalculatedLimitPriceValues extends CalculatedPriceInput {
  display: CalculatedPriceDisplay;
  error?: InputError;
}

export interface CalculatedOrderValues extends CalculatedOrderSchedule {
  orderType: OrderType;
  isMarketOrder: boolean;
  isTriggerPrice: boolean;
  slippageBps: number;
  inputAmount: string;
  outputAmount: string;
  inputAmountPerTrade: string;
  minOutputAmountPerTrade: string;
  minOutputAmountTotal: string;
  triggerOutputAmountPerTrade: string;
  tradePrice: string;
  marketPrice: string;
  limitPrice: string;
  triggerPrice: string;
  displayFeeAmount: string;
  displayFeePercent: number;
}

export interface CalculatedOrderTrades {
  totalTrades: number;
  maxTrades: number;
  inputAmountPerTrade: CalculatedAmount;
  minOutputAmountPerTrade: CalculatedAmount;
  triggerOutputAmountPerTrade: CalculatedAmount;
  error?: InputError;
}

export interface CalculatedOrderFees extends CalculatedAmount {
  percentage: number;
}

export interface CalculatedOrderFormSchedule extends CalculatedOrderSchedule {
  fillDelayError?: InputError;
  durationError?: InputError;
}

export interface CalculatedOrderFormErrors {
  primary?: InputError;
  all: InputError[];
  minTradeSize?: InputError;
  triggerPrice?: InputError;
  limitPrice?: InputError;
  trades?: InputError;
  fillDelay?: InputError;
  duration?: InputError;
  balance?: InputError;
}

export interface CalculatedOrderForm {
  module: Module;
  isInverted: boolean;
  inputAmount: CalculatedOrderInputAmount;
  outputAmount: CalculatedAmount;
  marketPrice: CalculatedMarketPriceValues;
  trades: CalculatedOrderTrades;
  schedule: CalculatedOrderFormSchedule;
  triggerPrice: CalculatedTriggerPriceValues;
  limitPrice: CalculatedLimitPriceValues;
  minOutputAmountTotal: CalculatedAmount;
  tradePrice: CalculatedAmount;
  fees: CalculatedOrderFees;
  values: CalculatedOrderValues;
  errors: CalculatedOrderFormErrors;
  isReady: boolean;
  canSubmit: boolean;
}

export interface CalculatedOrderPrices {
  isMarketOrder: boolean;
  triggerPrice: CalculatedTriggerPriceValues;
  limitPrice: CalculatedLimitPriceValues;
}

export interface CalculatedOrderTradePlan {
  totalTrades: number;
  maxTrades: number;
  error?: InputError;
}

export interface CalculatedOrderFormValidation {
  errors: CalculatedOrderFormErrors;
  isReady: boolean;
  canSubmit: boolean;
}

export interface CalculateOrderScheduleParams {
  module: Module;
  totalTrades: number;
  fillDelay?: TimeDuration;
  duration?: TimeDuration;
}

export interface CalculatePriceInputParams {
  tokenDecimals: number;
  initialPrice?: string;
  typedValue?: string;
  percentage?: string | null;
  isInverted?: boolean;
}

export interface CalculatePriceDisplayParams {
  raw?: string;
  typedValue?: string;
  amountDecimals?: number;
  invertedAmountDecimals?: number;
  amountUsdPrice?: string;
  invertedAmountUsdPrice?: string;
  isInverted?: boolean;
}

export interface CalculateTriggerPriceValuesParams {
  module: Module;
  marketPrice?: string;
  inputAmountRaw?: string;
  triggerPrice?: string;
  triggerPricePercent?: string | null;
  isInverted?: boolean;
  inputTokenDecimals?: number;
  outputTokenDecimals: number;
  inputUsdPrice?: string;
  outputUsdPrice?: string;
}

export interface CalculateLimitPriceValuesParams {
  module: Module;
  isMarketOrder: boolean;
  marketPrice?: string;
  inputAmountRaw?: string;
  limitPrice?: string;
  limitPricePercent?: string | null;
  triggerPrice?: string;
  isInverted?: boolean;
  inputTokenDecimals?: number;
  outputTokenDecimals: number;
  inputUsdPrice?: string;
  outputUsdPrice?: string;
}

export interface CalculateOrderValuesParams {
  module: Module;
  inputTokenDecimals: number;
  totalInputAmount: string;
  fillDelay?: TimeDuration;
  duration?: TimeDuration;
  totalTrades: number;
  priceProtectionPercent: number;
  isMarketOrder: boolean;
  marketPrice?: string;
  limitPrice?: string;
  triggerPrice?: string;
  displayFeePercent?: number;
}

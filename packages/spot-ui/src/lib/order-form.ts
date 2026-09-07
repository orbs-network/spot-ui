import BN from "bignumber.js";
import {
  calculateLimitPriceValues,
  calculateOrderValues,
  calculateTriggerPriceValues,
  calculateUsdAmount,
  toAmountUI,
  type CalculatedLimitPriceValues,
  type CalculatedOrderSchedule,
  type CalculatedOrderValues,
  type CalculatedTriggerPriceValues,
} from "./calculations";
import {
  getTrades,
  getMaxTradesError,
  getMaxFillDelayError,
  getMaxOrderDurationError,
  getMaxPossibleTrades,
  getMinFillDelayError,
  getMinOrderDurationError,
} from "./lib";
import {
  InputErrors,
  Module,
  type InputError,
  type TimeDuration,
} from "./types";

export interface CalculateOrderFormParams {
  module: Module;
  isMarketOrder: boolean;
  inputAmountWei: string;
  inputTokenDecimals: number;
  outputTokenDecimals: number;
  marketPrice?: string;
  quotedOutputAmount?: string;
  inputUsdPrice?: string;
  outputUsdPrice?: string;
  minTradeSizeUsd: number;
  trades?: number;
  fillDelay?: TimeDuration;
  duration?: TimeDuration;
  limitPrice?: string;
  limitPricePercent?: string | null;
  triggerPrice?: string;
  triggerPricePercent?: string | null;
  isInverted?: boolean;
  priceProtection: number;
  /** Display-only estimate; fee collection is configured outside the SDK. */
  displayFeePercent?: number;
  inputBalance?: string;
  ignoreErrors?: boolean;
}

export interface CalculatedAmount {
  raw: string;
  ui: string;
  usd: string;
}

export interface CalculatedOrderInputAmount extends CalculatedAmount {
  isEmpty: boolean;
}

export interface CalculateMarketPriceValuesParams {
  marketPrice?: string;
  quotedOutputAmount?: string;
  inputAmountWei?: string;
  inputTokenDecimals: number;
  outputTokenDecimals: number;
  outputUsdPrice?: string;
}

export interface CalculatedMarketPriceValues {
  raw: string;
  ui: string;
  usd: string;
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

const normalizeAmount = (value?: string): string => {
  if (!value) return "";
  const amount = BN(value);
  return amount.isFinite() && !amount.isNaN() ? value : "";
};

const calculateAmountValues = (
  amount: string,
  decimals: number,
  usdPrice?: string,
): CalculatedAmount => {
  const normalizedAmount = normalizeAmount(amount);
  const ui = toAmountUI(normalizedAmount, decimals);

  return {
    raw: normalizedAmount,
    ui,
    usd: calculateUsdAmount(ui, usdPrice),
  };
};

export const calculateMarketPriceValues = (
  params: CalculateMarketPriceValuesParams,
): CalculatedMarketPriceValues => {
  const explicitMarketPrice = normalizeAmount(params.marketPrice);
  const quotedOutputAmount = normalizeAmount(params.quotedOutputAmount);
  const inputAmountUI = toAmountUI(
    normalizeAmount(params.inputAmountWei),
    params.inputTokenDecimals,
  );
  const derivedMarketPrice =
    quotedOutputAmount && inputAmountUI && BN(inputAmountUI).gt(0)
      ? BN(quotedOutputAmount).dividedBy(inputAmountUI).toFixed()
      : "";
  const raw = explicitMarketPrice || derivedMarketPrice;
  const ui = toAmountUI(raw, params.outputTokenDecimals);

  return {
    raw,
    ui,
    usd: calculateUsdAmount(ui, params.outputUsdPrice),
  };
};

const formatFillDelayErrorValue = (milliseconds: number): string => {
  const minutes = milliseconds / 60_000;
  const days = minutes / 60 / 24;
  if (days >= 1) {
    return `${days.toFixed(days % 1 ? 1 : 0)} ${days === 1 ? "day" : "days"}`;
  }

  const hours = minutes / 60;
  if (hours >= 1) {
    return `${hours.toFixed(hours % 1 ? 1 : 0)} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${minutes.toFixed(minutes % 1 ? 1 : 0)} ${minutes === 1 ? "minute" : "minutes"}`;
};

const calculateTradesError = (
  params: CalculateOrderFormParams,
  marketPrice: string,
  inputAmount: CalculatedOrderInputAmount,
  totalTrades: number,
  maxTrades: number,
): InputError | undefined => {
  if (
    BN(inputAmount.raw || "0").isZero() ||
    !marketPrice ||
    BN(params.inputUsdPrice || "0").isZero()
  ) {
    return undefined;
  }
  if (!totalTrades) {
    return {
      type: InputErrors.MIN_TRADES,
      value: 1,
      args: { minTrades: "1" },
    };
  }

  const maxTradesError = getMaxTradesError(
    totalTrades,
    maxTrades,
    params.module,
  );
  if (maxTradesError.isError) {
    return {
      type: InputErrors.MAX_TRADES,
      value: maxTrades,
      args: { maxTrades: `${maxTrades}` },
    };
  }

  return undefined;
};

const calculateFillDelayError = (
  inputAmount: string,
  marketPrice: string | undefined,
  schedule: CalculatedOrderSchedule,
): InputError | undefined => {
  if (BN(inputAmount || "0").isZero() || !marketPrice) return undefined;

  const minError = getMinFillDelayError(schedule.fillDelay);
  if (minError.isError) {
    return {
      type: InputErrors.MIN_FILL_DELAY,
      value: minError.value,
      args: { fillDelay: formatFillDelayErrorValue(minError.value) },
    };
  }

  const maxError = getMaxFillDelayError(
    schedule.fillDelay,
    schedule.totalTrades,
  );
  if (maxError.isError) {
    return {
      type: InputErrors.MAX_FILL_DELAY,
      value: maxError.value,
      args: { fillDelay: formatFillDelayErrorValue(maxError.value) },
    };
  }
  return undefined;
};

const calculateDurationError = (
  module: Module,
  inputAmount: string,
  marketPrice: string | undefined,
  schedule: CalculatedOrderSchedule,
): InputError | undefined => {
  if (BN(inputAmount || "0").isZero() || !marketPrice) return undefined;

  const maxError = getMaxOrderDurationError(module, schedule.duration);
  if (maxError.isError) {
    return {
      type: InputErrors.MAX_ORDER_DURATION,
      value: maxError.value,
      args: {
        duration: `${Math.floor(maxError.value / 86_400_000).toFixed(0)} days`,
      },
    };
  }

  const minError = getMinOrderDurationError(schedule.duration);
  if (minError.isError) {
    return {
      type: InputErrors.MIN_ORDER_DURATION,
      value: minError.value,
      args: {
        duration: `${Math.floor(minError.value / 60_000).toFixed(0)} minutes`,
      },
    };
  }
  return undefined;
};

const calculateMinTradeSizeError = (
  inputAmount: CalculatedOrderInputAmount,
  minTradeSizeUsd: number,
): InputError | undefined => {
  if (!BN(inputAmount.raw || 0).gt(0) || !inputAmount.usd) {
    return undefined;
  }
  if (!BN(minTradeSizeUsd).gt(inputAmount.usd)) return undefined;

  return {
    type: InputErrors.MIN_TRADE_SIZE,
    value: minTradeSizeUsd,
    args: { minTradeSize: `${minTradeSizeUsd}` },
  };
};

interface CalculatedOrderPrices {
  isMarketOrder: boolean;
  triggerPrice: CalculatedTriggerPriceValues;
  limitPrice: CalculatedLimitPriceValues;
}

interface CalculatedOrderTradePlan {
  totalTrades: number;
  maxTrades: number;
  error?: InputError;
}

interface CalculatedOrderFormValidation {
  errors: CalculatedOrderFormErrors;
  isReady: boolean;
  canSubmit: boolean;
}

const calculateOrderInputAmount = (
  params: CalculateOrderFormParams,
): CalculatedOrderInputAmount => {
  const amountValues = calculateAmountValues(
    params.inputAmountWei,
    params.inputTokenDecimals,
    params.inputUsdPrice,
  );

  return {
    ...amountValues,
    isEmpty: !BN(amountValues.raw || 0).gt(0),
  };
};

const calculateOrderTradePlan = (
  params: CalculateOrderFormParams,
  inputAmount: CalculatedOrderInputAmount,
  marketPrice: string,
): CalculatedOrderTradePlan => {
  const maxTrades = getMaxPossibleTrades(
    inputAmount.ui,
    params.inputUsdPrice,
    params.minTradeSizeUsd,
  );
  const totalTrades = getTrades(
    maxTrades,
    params.module,
    params.trades,
  );

  return {
    totalTrades,
    maxTrades,
    error: calculateTradesError(
      params,
      marketPrice,
      inputAmount,
      totalTrades,
      maxTrades,
    ),
  };
};

const calculateOrderFormTrades = (
  params: CalculateOrderFormParams,
  tradePlan: CalculatedOrderTradePlan,
  values: CalculatedOrderValues,
): CalculatedOrderTrades => ({
  totalTrades: tradePlan.totalTrades,
  maxTrades: tradePlan.maxTrades,
  inputAmountPerTrade: calculateAmountValues(
    values.inputAmountPerTrade,
    params.inputTokenDecimals,
    params.inputUsdPrice,
  ),
  minOutputAmountPerTrade: calculateAmountValues(
    values.minOutputAmountPerTrade,
    params.outputTokenDecimals,
    params.outputUsdPrice,
  ),
  triggerOutputAmountPerTrade: calculateAmountValues(
    values.triggerOutputAmountPerTrade,
    params.outputTokenDecimals,
    params.outputUsdPrice,
  ),
  error: tradePlan.error,
});

const calculateOrderFormSchedule = (
  params: CalculateOrderFormParams,
  inputAmount: string,
  marketPrice: string,
  schedule: CalculatedOrderSchedule,
): CalculatedOrderFormSchedule => {
  return {
    totalTrades: schedule.totalTrades,
    fillDelay: schedule.fillDelay,
    fillDelayMillis: schedule.fillDelayMillis,
    duration: schedule.duration,
    durationMillis: schedule.durationMillis,
    fillDelayError: calculateFillDelayError(
      inputAmount,
      marketPrice,
      schedule,
    ),
    durationError: calculateDurationError(
      params.module,
      inputAmount,
      marketPrice,
      schedule,
    ),
  };
};

const calculateOrderPrices = (
  params: CalculateOrderFormParams,
  inputAmount: string,
  marketPrice: string,
): CalculatedOrderPrices => {
  const triggerPrice = calculateTriggerPriceValues({
    module: params.module,
    marketPrice,
    inputAmountWei: inputAmount,
    triggerPrice: params.triggerPrice,
    triggerPricePercent: params.triggerPricePercent,
    isInverted: params.isInverted,
    inputTokenDecimals: params.inputTokenDecimals,
    outputTokenDecimals: params.outputTokenDecimals,
    inputUsdPrice: params.inputUsdPrice,
    outputUsdPrice: params.outputUsdPrice,
  });
  const isMarketOrder =
    params.module === Module.LIMIT ? false : params.isMarketOrder;
  const limitPrice = calculateLimitPriceValues({
    module: params.module,
    isMarketOrder,
    marketPrice,
    inputAmountWei: inputAmount,
    limitPrice: params.limitPrice,
    limitPricePercent: params.limitPricePercent,
    triggerPrice: triggerPrice.raw,
    isInverted: params.isInverted,
    inputTokenDecimals: params.inputTokenDecimals,
    outputTokenDecimals: params.outputTokenDecimals,
    inputUsdPrice: params.inputUsdPrice,
    outputUsdPrice: params.outputUsdPrice,
  });

  return { isMarketOrder, triggerPrice, limitPrice };
};

const validateOrderForm = (
  params: CalculateOrderFormParams,
  inputAmount: CalculatedOrderInputAmount,
  marketPrice: string,
  tradePlan: CalculatedOrderTradePlan,
  schedule: CalculatedOrderFormSchedule,
  prices: CalculatedOrderPrices,
): CalculatedOrderFormValidation => {
  const minTradeSizeError = calculateMinTradeSizeError(
    inputAmount,
    params.minTradeSizeUsd,
  );
  const balanceError: InputError | undefined =
    params.inputBalance && BN(inputAmount.raw).gt(params.inputBalance)
      ? {
          type: InputErrors.INSUFFICIENT_BALANCE,
          value: params.inputBalance,
        }
      : undefined;
  const orderedErrors = [
    minTradeSizeError,
    prices.triggerPrice.error,
    prices.limitPrice.error,
    tradePlan.error,
    schedule.fillDelayError,
    schedule.durationError,
    balanceError,
  ].filter((error): error is InputError => Boolean(error));
  const isReady =
    BN(marketPrice || 0).gt(0) &&
    BN(inputAmount.raw || 0).gt(0) &&
    BN(params.inputUsdPrice || 0).gt(0);
  const primaryError =
    params.ignoreErrors || !isReady ? undefined : orderedErrors[0];
  const errors: CalculatedOrderFormErrors = {
    primary: primaryError,
    all: orderedErrors,
    minTradeSize: minTradeSizeError,
    triggerPrice: prices.triggerPrice.error,
    limitPrice: prices.limitPrice.error,
    trades: tradePlan.error,
    fillDelay: schedule.fillDelayError,
    duration: schedule.durationError,
    balance: balanceError,
  };

  return {
    errors,
    isReady,
    canSubmit: isReady && !primaryError,
  };
};

export const calculateOrderForm = (
  params: CalculateOrderFormParams,
): CalculatedOrderForm => {
  const inputAmountValues = calculateOrderInputAmount(params);
  const inputAmount = inputAmountValues.raw;
  const marketPriceValues = calculateMarketPriceValues({
    marketPrice: params.marketPrice,
    quotedOutputAmount: params.quotedOutputAmount,
    inputAmountWei: inputAmount,
    inputTokenDecimals: params.inputTokenDecimals,
    outputTokenDecimals: params.outputTokenDecimals,
    outputUsdPrice: params.outputUsdPrice,
  });
  const marketPrice = marketPriceValues.raw;
  const tradePlan = calculateOrderTradePlan(
    params,
    inputAmountValues,
    marketPrice,
  );
  const prices = calculateOrderPrices(params, inputAmount, marketPrice);
  const values = calculateOrderValues({
    module: params.module,
    inputTokenDecimals: params.inputTokenDecimals,
    totalInputAmount: inputAmount,
    fillDelay: params.fillDelay,
    duration: params.duration,
    totalTrades: tradePlan.totalTrades,
    priceProtection: params.priceProtection,
    isMarketOrder: prices.isMarketOrder,
    marketPrice,
    limitPrice: prices.limitPrice.raw,
    triggerPrice: prices.triggerPrice.raw,
    displayFeePercent: params.displayFeePercent,
  });
  const schedule = calculateOrderFormSchedule(
    params,
    inputAmount,
    marketPrice,
    values,
  );
  const trades = calculateOrderFormTrades(params, tradePlan, values);
  const validation = validateOrderForm(
    params,
    inputAmountValues,
    marketPrice,
    tradePlan,
    schedule,
    prices,
  );

  return {
    module: params.module,
    isInverted: Boolean(params.isInverted),
    inputAmount: inputAmountValues,
    outputAmount: calculateAmountValues(
      values.outputAmount,
      params.outputTokenDecimals,
      params.outputUsdPrice,
    ),
    marketPrice: marketPriceValues,
    trades,
    schedule,
    triggerPrice: prices.triggerPrice,
    limitPrice: prices.limitPrice,
    minOutputAmountTotal: calculateAmountValues(
      values.minOutputAmountTotal,
      params.outputTokenDecimals,
      params.outputUsdPrice,
    ),
    tradePrice: calculateAmountValues(
      values.tradePrice,
      params.outputTokenDecimals,
      params.outputUsdPrice,
    ),
    fees: {
      ...calculateAmountValues(
        values.displayFeeAmount,
        params.outputTokenDecimals,
        params.outputUsdPrice,
      ),
      percentage: values.displayFeePercent,
    },
    values,
    ...validation,
  };
};

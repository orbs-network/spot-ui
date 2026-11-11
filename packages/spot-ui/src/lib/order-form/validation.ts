import BN from "bignumber.js";
import { InputErrors, OrderType, type InputError } from "../types";
import { SpotError } from "../errors";
import { getOrderEpochSeconds } from "../order-timing";
import { assertOrderSlippageBps } from "./price-protection";
import {
  getMaxFillDelayError,
  getMaxOrderDurationError,
  getMaxTradesError,
  getMinFillDelayError,
  getMinOrderDurationError,
} from "./schedule";
import type {
  CalculateOrderFormParams,
  CalculatedOrderFormSchedule,
  CalculatedOrderFormValidation,
  CalculatedOrderInputAmount,
  CalculatedOrderPrices,
  CalculatedOrderSchedule,
  CalculatedOrderTradePlan,
  CalculatedOrderValues,
  OrderFormNotReadyReason,
} from "./types";

const hasInputUsdValue = (
  params: CalculateOrderFormParams,
  inputAmount: CalculatedOrderInputAmount,
): boolean => {
  const usdAmount = BN(inputAmount.usd || 0);
  if (usdAmount.isFinite() && usdAmount.gt(0)) return true;

  const unitPrice = BN(params.inputTokenUsdPrice || 0);
  return unitPrice.isFinite() && unitPrice.gt(0);
};

const formatDurationErrorValue = (milliseconds: number): string => {
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

const formatMinimumDuration = (milliseconds: number): string => {
  let remaining = milliseconds;
  const parts: string[] = [];
  for (const [unit, label] of [[86_400_000, "day"], [3_600_000, "hour"], [60_000, "minute"], [1000, "second"]] as const) {
    const amount = Math.floor(remaining / unit);
    if (amount > 0) parts.push(`${amount} ${label}${amount === 1 ? "" : "s"}`);
    remaining %= unit;
  }
  return parts.join(" ");
};

export const calculateTradesError = (
  params: CalculateOrderFormParams,
  marketPrice: string,
  inputAmount: CalculatedOrderInputAmount,
  totalTrades: number,
  maxTrades: number,
): InputError | undefined => {
  if (
    BN(inputAmount.raw || "0").isZero() ||
    !marketPrice ||
    !hasInputUsdValue(params, inputAmount)
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
    params.orderType,
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

export const calculateFillDelayError = (
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
      args: { fillDelay: formatDurationErrorValue(minError.value) },
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
      args: { fillDelay: formatDurationErrorValue(maxError.value) },
    };
  }
  return undefined;
};

export const calculateDurationError = (
  orderType: OrderType,
  inputAmount: string,
  marketPrice: string | undefined,
  schedule: CalculatedOrderSchedule,
): InputError | undefined => {
  if (BN(inputAmount || "0").isZero() || !marketPrice) return undefined;

  const maxError = getMaxOrderDurationError(orderType, schedule.duration);
  if (maxError.isError) {
    return {
      type: InputErrors.MAX_ORDER_DURATION,
      value: maxError.value,
      args: {
        duration: `${Math.floor(maxError.value / 86_400_000).toFixed(0)} days`,
      },
    };
  }

  const minError = getMinOrderDurationError(orderType, schedule);
  if (minError.isError) {
    return {
      type: InputErrors.MIN_ORDER_DURATION,
      value: minError.value,
      args: {
        duration: formatMinimumDuration(minError.value),
      },
    };
  }
  return undefined;
};

/** Recheck the schedule/protection actually consumed by signing before wallet work. */
export const assertOrderExecutionValues = (
  orderType: OrderType,
  values: CalculatedOrderValues,
): void => {
  assertOrderSlippageBps(values.slippageBps);
  if (orderType !== OrderType.TWAP) return;
  if (!Number.isSafeInteger(values.totalTrades) || values.totalTrades < 1) {
    throw new SpotError("INVALID_ARGUMENT", "TWAP totalTrades must be a positive safe integer");
  }
  if (values.totalTrades > 1) {
    const epoch = getOrderEpochSeconds(values.fillDelayMillis, values.totalTrades);
    if (!Number.isFinite(values.fillDelayMillis) || !Number.isSafeInteger(epoch) || epoch <= 0) {
      throw new SpotError("INVALID_ARGUMENT", "Multiple TWAP trades require a positive finite interval");
    }
  }
  const minimum = getMinOrderDurationError(orderType, values);
  if (minimum.isError) {
    throw new SpotError("FORM_NOT_SUBMITTABLE", `TWAP duration must be at least ${formatMinimumDuration(minimum.value)} to cover its trade schedule`);
  }
};

const calculateMinTradeSizeError = (
  inputAmount: CalculatedOrderInputAmount,
  minTradeSizeUsd: number,
): InputError | undefined => {
  if (!BN(inputAmount.raw || 0).gt(0) || !inputAmount.usd) return undefined;
  if (!BN(minTradeSizeUsd).gt(inputAmount.usd)) return undefined;

  return {
    type: InputErrors.MIN_TRADE_SIZE,
    value: minTradeSizeUsd,
    args: { minTradeSize: `${minTradeSizeUsd}` },
  };
};

const calculateBalanceError = (
  inputAmountRaw: string,
  inputBalanceRaw?: string,
): InputError | undefined => {
  if (!inputBalanceRaw || !BN(inputAmountRaw).gt(inputBalanceRaw)) return undefined;
  return { type: InputErrors.INSUFFICIENT_BALANCE, value: inputBalanceRaw };
};

interface FormReadiness {
  hasRequiredInputs: boolean;
  isReady: boolean;
  notReadyReason?: OrderFormNotReadyReason;
}

const calculateFormReadiness = (
  params: CalculateOrderFormParams,
  inputAmount: CalculatedOrderInputAmount,
  marketPrice: string,
): FormReadiness => {
  const hasInputAmount = BN(inputAmount.raw || 0).gt(0);
  const hasMarketQuote = BN(marketPrice || 0).gt(0);
  const hasUsdValue = hasInputUsdValue(params, inputAmount);
  const hasRequiredInputs = hasInputAmount && hasMarketQuote && hasUsdValue;

  // Report the first missing prerequisite, before errors in editable form fields.
  let notReadyReason: OrderFormNotReadyReason | undefined;
  if (!hasInputAmount) notReadyReason = "empty-input";
  else if (!hasMarketQuote) notReadyReason = "awaiting-quote";
  else if (!hasUsdValue) notReadyReason = "missing-usd-value";
  return { hasRequiredInputs, isReady: hasRequiredInputs, notReadyReason };
};

export const validateOrderForm = (
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
  const balanceError = calculateBalanceError(inputAmount.raw, params.inputBalanceRaw);
  const readiness = calculateFormReadiness(params, inputAmount, marketPrice);
  const orderedErrors = [
    minTradeSizeError,
    prices.triggerPrice.error,
    prices.limitPrice.error,
    tradePlan.error,
    schedule.fillDelayError,
    schedule.durationError,
    balanceError,
  ].filter((error): error is InputError => Boolean(error));
  const primaryError = readiness.hasRequiredInputs ? orderedErrors[0] : undefined;

  return {
    errors: {
      primary: primaryError,
      all: orderedErrors,
      minTradeSize: minTradeSizeError,
      triggerPrice: prices.triggerPrice.error,
      limitPrice: prices.limitPrice.error,
      trades: tradePlan.error,
      fillDelay: schedule.fillDelayError,
      duration: schedule.durationError,
      balance: balanceError,
    },
    isReady: readiness.isReady,
    notReadyReason: readiness.notReadyReason,
    canSubmit: readiness.isReady && !primaryError,
  };
};

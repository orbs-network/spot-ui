import BN from "bignumber.js";
import { InputErrors, Module, type InputError } from "../types";
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
} from "./types";

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
    BN(params.inputTokenUsdPrice || "0").isZero()
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
  if (!BN(inputAmount.raw || 0).gt(0) || !inputAmount.usd) return undefined;
  if (!BN(minTradeSizeUsd).gt(inputAmount.usd)) return undefined;

  return {
    type: InputErrors.MIN_TRADE_SIZE,
    value: minTradeSizeUsd,
    args: { minTradeSize: `${minTradeSizeUsd}` },
  };
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
  const balanceError: InputError | undefined =
    params.inputBalanceRaw && BN(inputAmount.raw).gt(params.inputBalanceRaw)
      ? {
          type: InputErrors.INSUFFICIENT_BALANCE,
          value: params.inputBalanceRaw,
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
    BN(params.inputTokenUsdPrice || 0).gt(0);
  const primaryError = !isReady ? undefined : orderedErrors[0];

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
    isReady,
    canSubmit: isReady && !primaryError,
  };
};

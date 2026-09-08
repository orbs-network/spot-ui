import BN from "bignumber.js";
import {
  DEFAULT_FILL_DELAY,
  MAX_ORDER_DURATION_MILLIS,
  MIN_FILL_DELAY_MILLIS,
  MIN_ORDER_DURATION_MILLIS,
} from "./constants";
import { Module, TimeUnit, type TimeDuration } from "../types";
import { findTimeUnit, getTimeDurationMillis } from "../utils";
import type {
  CalculateOrderScheduleParams,
  CalculatedOrderSchedule,
} from "./types";

export const getDuration = (
  module: Module,
  totalTrades: number,
  fillDelay: TimeDuration,
  customDuration?: TimeDuration,
): TimeDuration => {
  const minDuration = getTimeDurationMillis(fillDelay) * 2 * totalTrades;

  if (customDuration) return customDuration;
  if (module === Module.LIMIT) return { unit: TimeUnit.Days, value: 7 };
  if (module === Module.STOP_LOSS || module === Module.TAKE_PROFIT) {
    return { unit: TimeUnit.Days, value: 1 };
  }

  const unit = findTimeUnit(minDuration);
  return { unit, value: Number(BN(minDuration / unit).toFixed(2)) };
};

export const getTrades = (
  maxPossibleTrades: number,
  module: Module,
  selectedTrades?: number,
): number => {
  if (module !== Module.TWAP) return 1;
  if (selectedTrades !== undefined) return selectedTrades;
  return Math.max(1, Math.ceil(maxPossibleTrades / 2));
};

export const getMaxPossibleTrades = (
  inputAmount?: string,
  inputUsdPrice?: string,
  minTradeSizeUsd?: number,
): number => {
  if (!inputAmount || !inputUsdPrice || !minTradeSizeUsd) return 1;

  const totalUsd = BN(inputUsdPrice).times(inputAmount);
  const maxTradesBySize = totalUsd
    .div(minTradeSizeUsd)
    .integerValue(BN.ROUND_FLOOR)
    .toNumber();

  return Math.max(1, maxTradesBySize);
};

export const getMaxFillDelayError = (
  fillDelay: TimeDuration,
  totalTrades: number,
): { isError: boolean; value: number } => {
  const isDefault =
    fillDelay.unit === DEFAULT_FILL_DELAY.unit &&
    fillDelay.value === DEFAULT_FILL_DELAY.value;
  return {
    isError:
      !isDefault &&
      getTimeDurationMillis(fillDelay) * totalTrades >
        MAX_ORDER_DURATION_MILLIS,
    value: Math.floor(MAX_ORDER_DURATION_MILLIS / totalTrades),
  };
};

export const getMaxOrderDurationError = (
  module: Module,
  duration: TimeDuration,
): { isError: boolean; value: number } => {
  if (module === Module.STOP_LOSS || module === Module.TAKE_PROFIT) {
    const max = 60 * 24 * 60 * 60 * 1000;
    return {
      isError: getTimeDurationMillis(duration) > max,
      value: max,
    };
  }
  return {
    isError: getTimeDurationMillis(duration) > MAX_ORDER_DURATION_MILLIS,
    value: MAX_ORDER_DURATION_MILLIS,
  };
};

export const getMinOrderDurationError = (
  duration: TimeDuration,
): { isError: boolean; value: number } => ({
  isError: getTimeDurationMillis(duration) < MIN_ORDER_DURATION_MILLIS,
  value: MIN_ORDER_DURATION_MILLIS,
});

export const getMinFillDelayError = (
  fillDelay: TimeDuration,
): { isError: boolean; value: number } => ({
  isError: getTimeDurationMillis(fillDelay) < MIN_FILL_DELAY_MILLIS,
  value: MIN_FILL_DELAY_MILLIS,
});

export const getMaxTradesError = (
  totalTrades: number,
  maxTrades: number,
  module: Module,
): { isError: boolean; value: number } => ({
  isError: module === Module.TWAP && BN(totalTrades).isGreaterThan(maxTrades),
  value: maxTrades,
});

const normalizeTotalTrades = (
  module: Module,
  requestedTrades: number,
): number => {
  const finiteTrades = Number.isFinite(requestedTrades)
    ? Math.floor(requestedTrades)
    : 1;
  return module === Module.TWAP ? Math.max(1, finiteTrades) : 1;
};

const getDurationMillis = (duration: TimeDuration): number => {
  const milliseconds = duration.unit * duration.value;
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
};

export const calculateOrderSchedule = (
  params: CalculateOrderScheduleParams,
): CalculatedOrderSchedule => {
  const totalTrades = normalizeTotalTrades(params.module, params.totalTrades);
  const fillDelay = params.fillDelay ?? { ...DEFAULT_FILL_DELAY };
  const duration = getDuration(
    params.module,
    totalTrades,
    fillDelay,
    params.duration,
  );

  return {
    totalTrades,
    fillDelay,
    fillDelayMillis: getDurationMillis(fillDelay),
    duration,
    durationMillis: getDurationMillis(duration),
  };
};

import { TimeUnit, type TimeDuration } from "../types";

export const MIN_FILL_DELAY_MILLIS = 5 * 60 * 1000;
export const MAX_ORDER_DURATION_MILLIS = 60 * 24 * 60 * 60 * 1000;
export const MIN_ORDER_DURATION_MILLIS = 5 * 60 * 1000;

export const DEFAULT_FILL_DELAY: TimeDuration = {
  unit: TimeUnit.Minutes,
  value: MIN_FILL_DELAY_MILLIS / 60_000,
};

export const DEFAULT_STOP_LOSS_PERCENTAGE = "-5";
export const DEFAULT_TAKE_PROFIT_PERCENTAGE = "10";
export const DEFAULT_STOP_LOSS_LIMIT_PERCENTAGE = "-10";
export const DEFAULT_TAKE_PROFIT_LIMIT_PERCENTAGE = "5";

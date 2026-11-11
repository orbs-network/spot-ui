import { NATIVE_TOKEN_ADDRESSES } from "./evm-constants";
import BN from "bignumber.js";
import {
  Config,
  Order,
  type DeepReadonly,
  OrderVariant,
  TimeDuration,
  TimeUnit,
} from "./types";
import {
  getEstimatedDelayBetweenTradesMillis,
  getLegacyExchanges,
} from "./orders/legacy-twap-config";

export const amountUi = (decimals?: number, amount?: string) => {
  if (decimals == null || !amount) return "";
  const precision = BN(10).pow(decimals);
  return BN(amount).times(precision).idiv(precision).div(precision).toFixed();
};

/** Compares strings without case sensitivity, for example EVM addresses or order hashes. */
export function eqIgnoreCase(a: string, b: string) {
  return a == b || a.toLowerCase() == b.toLowerCase();
}

/** Recognizes the SDK's native-token placeholder addresses; wrapped native tokens return false. */
export const isNativeAddress = (address?: string) =>
  NATIVE_TOKEN_ADDRESSES.some((candidate) =>
    eqIgnoreCase(candidate, address || ""),
  );

export function findTimeUnit(millis: number): TimeUnit {
  const units = [
    TimeUnit.Years,
    TimeUnit.Months,
    TimeUnit.Weeks,
    TimeUnit.Days,
    TimeUnit.Hours,
    TimeUnit.Minutes,
  ];
  return units.find((unit) => unit <= millis) || TimeUnit.Minutes;
}

export const getTimeDurationMillis = (duration?: TimeDuration) => {
  if (!duration) return 0;
  return duration.value * duration.unit;
};

export const safeBNString = (value?: string | number) => {
  if (!value || value === "NaN") return "0";
  return BN(value).decimalPlaces(0).toFixed();
};

export const getExchanges = (config?: Config[]) => {
  if (!config) return undefined;
  const legacyAddresses = config.flatMap(getLegacyExchanges);
  const exchangeAddresses = config.map((c) => c.exchangeAddress);

  const allAddresses = new Set(
    [...exchangeAddresses, ...legacyAddresses].map((a) => a.toLowerCase()),
  );

  return Array.from(allAddresses);
};

/**
 * Returns the order's delay between fills in milliseconds across history versions.
 * Legacy v1 delays are converted from seconds and include the configured estimated
 * execution delay when `config` is supplied. V2 delays are already normalized.
 */
export const getOrderFillDelayMillis = (order: DeepReadonly<Order>, config?: Config) => {
  if (order.version === 1) {
    return (
      (order.fillDelay || 0) * 1000 +
      (config ? getEstimatedDelayBetweenTradesMillis(config) : 0)
    );
  }
  // v2 history normalization already stores epoch/fillDelay in milliseconds.
  return order.fillDelay || 0;
};

/**
 * Calculates the realized rate in output tokens per input token from raw filled amounts.
 * Pass each token's actual decimals; the default is 18 for both tokens.
 * Returns `""` until both filled amounts are positive.
 */
export const getOrderExecutionRate = (
  srcAmountFilled = "",
  dstAmountFilled = "",
  srcTokenDecimals = 18,
  dstTokenDecimals = 18,
) => {
  if (
    !BN(srcAmountFilled || 0).gt(0) ||
    !BN(dstAmountFilled || 0).gt(0)
  )
    return "";
  const srcFilledAmountUi = amountUi(srcTokenDecimals, srcAmountFilled);
  const dstFilledAmountUi = amountUi(dstTokenDecimals, dstAmountFilled);

  return BN(dstFilledAmountUi).div(srcFilledAmountUi).toFixed();
};


/**
 * Returns the minimum output tokens per input token for one trade, using each
 * token's decimal precision. Returns `""` for a TWAP market order.
 */
export const getOrderLimitPriceRate = (
  order: DeepReadonly<Order>,
  srcTokenDecimals: number,
  dstTokenDecimals: number,
) => {
  if (order.type === OrderVariant.TWAP_MARKET) return "";
  const srcBidAmountUi = amountUi(srcTokenDecimals, order.srcAmountPerTrade);
  const dstMinAmountUi = amountUi(dstTokenDecimals, order.dstMinAmountPerTrade);
  return BN(dstMinAmountUi).div(srcBidAmountUi).toFixed();
};


/**
 * Returns the trigger rate in output tokens per input token for one trade, using
 * each token's decimal precision. Returns `""` for a TWAP market order.
 */
export const getTriggerPriceRate = (
  order: DeepReadonly<Order>,
  srcTokenDecimals: number,
  dstTokenDecimals: number,
) => {
  if (order.type === OrderVariant.TWAP_MARKET) return "";
  const srcBidAmountUi = amountUi(srcTokenDecimals, order.srcAmountPerTrade);
  const dstMinAmountUi = amountUi(dstTokenDecimals, order.triggerPricePerTrade);
  return BN(dstMinAmountUi).div(srcBidAmountUi).toFixed();
};

import { NATIVE_TOKEN_ADDRESSES } from "./evm-constants";
import BN from "bignumber.js";
import {
  Config,
  Order,
  OrderType,
  Partners,
  TimeDuration,
  TimeUnit,
} from "./types";
import { getPartners } from "./partners";
import {
  getEstimatedDelayBetweenTradesMillis,
  getLegacyExchanges,
} from "./orders/legacy-twap-config";

export const amountUi = (decimals?: number, amount?: string) => {
  if (decimals == null || !amount) return "";
  const precision = BN(10).pow(decimals);
  return BN(amount).times(precision).idiv(precision).div(precision).toFixed();
};

export function eqIgnoreCase(a: string, b: string) {
  return a == b || a.toLowerCase() == b.toLowerCase();
}

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

export const isTxRejected = (error: unknown): boolean => {
  const candidates: unknown[] = [error];
  if (typeof error === "object" && error !== null) {
    candidates.push(Reflect.get(error, "error"), Reflect.get(error, "cause"));
  }

  return candidates.some((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      return typeof candidate === "string" &&
        isUserRejectionMessage(candidate);
    }

    const code = Reflect.get(candidate, "code");
    if (
      code === 4001 ||
      code === "4001" ||
      code === "ACTION_REJECTED" ||
      code === "USER_REJECTED" ||
      code === "USER_DENIED"
    ) {
      return true;
    }

    const message = Reflect.get(candidate, "message");
    return (
      typeof message === "string" &&
      isUserRejectionMessage(message)
    );
  });
};

const isUserRejectionMessage = (message: string): boolean =>
  /\buser\b.{0,80}\b(?:rejected|denied|cancelled|canceled)\b/i.test(
    message,
  ) ||
  /\brequest\b\s+(?:was\s+)?\b(?:rejected|denied|cancelled|canceled)\b/i.test(
    message,
  ) ||
  /\b(?:rejected|denied|cancelled|canceled)\b.{0,80}\bby\s+(?:the\s+)?user\b/i.test(
    message,
  );

export const getExchanges = (config?: Config[]) => {
  if (!config) return undefined;
  const legacyAddresses = config.flatMap(getLegacyExchanges);
  const exchangeAddresses = config.map((c) => c.exchangeAddress);

  const allAddresses = new Set(
    [...exchangeAddresses, ...legacyAddresses].map((a) => a.toLowerCase()),
  );

  return Array.from(allAddresses);
};

export const getOrderFillDelayMillis = (order: Order, config?: Config) => {
  if (order.version === 1) {
    return (
      (order.fillDelay || 0) * 1000 +
      (config ? getEstimatedDelayBetweenTradesMillis(config) : 0)
    );
  }
  // v2 history normalization already stores epoch/fillDelay in milliseconds.
  return order.fillDelay || 0;
};

export const getPartnerChains = (partner: Partners) => {
  return getPartners()
    .filter((p) => p.name === partner)
    .map((p) => p.chainId);
};

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


export const getOrderLimitPriceRate = (
  order: Order,
  srcTokenDecimals: number,
  dstTokenDecimals: number,
) => {
  if (order.type === OrderType.TWAP_MARKET) return "";
  const srcBidAmountUi = amountUi(srcTokenDecimals, order.srcAmountPerTrade);
  const dstMinAmountUi = amountUi(dstTokenDecimals, order.dstMinAmountPerTrade);
  return BN(dstMinAmountUi).div(srcBidAmountUi).toFixed();
};


export const getTriggerPriceRate = (
  order: Order,
  srcTokenDecimals: number,
  dstTokenDecimals: number,
) => {
  if (order.type === OrderType.TWAP_MARKET) return "";
  const srcBidAmountUi = amountUi(srcTokenDecimals, order.srcAmountPerTrade);
  const dstMinAmountUi = amountUi(dstTokenDecimals, order.triggerPricePerTrade);
  return BN(dstMinAmountUi).div(srcBidAmountUi).toFixed();
};

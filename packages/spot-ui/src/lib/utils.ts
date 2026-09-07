import {
  LEGACY_EXCHANGES_MAP,
  getPartnerIdentifier,
  maxUint256,
  nativeTokenAddresses,
  THE_GRAPH_ORDERS_API,
} from "./consts";
import BN from "bignumber.js";
import {
  Config,
  type Network,
  Order,
  OrderType,
  Partners,
  Token,
  TimeDuration,
  TimeUnit,
} from "./types";
import { networks } from "./networks";
import { getEstimatedDelayBetweenTradesMillis, getPartners } from "./lib";

export const getTheGraphUrl = (chainId?: number) => {
  if (!chainId) return;
  return THE_GRAPH_ORDERS_API[chainId as keyof typeof THE_GRAPH_ORDERS_API];
};

export const groupBy = (array: any = [], key: string) => {
  return array.reduce((result: any, currentItem: any) => {
    const groupKey = currentItem[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(currentItem);
    return result;
  }, {});
};

type KeyByArray<T> = {
  [key: string]: T;
};

export const keyBy = <T>(array: T[], key: keyof T): KeyByArray<T> => {
  return array.reduce((result, currentItem) => {
    const groupKey = currentItem[key] as unknown as string;
    result[groupKey] = currentItem;
    return result;
  }, {} as KeyByArray<T>);
};

export const compact = <T>(
  array: (T | null | undefined | false | "")[],
): T[] => {
  return array.filter((value): value is T => Boolean(value));
};

export const orderBy = <T>(
  array: T[],
  key: (item: T) => any,
  order: "asc" | "desc" = "asc",
): T[] => {
  return array.slice().sort((a, b) => {
    const valueA = key(a);
    const valueB = key(b);

    if (valueA < valueB) return order === "asc" ? -1 : 1;
    if (valueA > valueB) return order === "asc" ? 1 : -1;
    return 0;
  });
};

export const amountUi = (decimals?: number, amount?: string) => {
  if (decimals == null || !amount) return "";
  const precision = BN(10).pow(decimals);
  return BN(amount).times(precision).idiv(precision).div(precision).toFixed();
};

export const amountBN = (decimals?: number, amount?: string) => {
  if (decimals == null || !amount) return "";
  return parsebn(amount)
    .times(BN(10).pow(decimals))
    .decimalPlaces(0)
    .toFixed(0);
};
export const zero = BN(0);
export const one = BN(1);
export const ten = BN(10);
export const ether = BN(1e18);

export function bn(n: BN.Value, base?: number): BN {
  if (n instanceof BN) return n;
  if (!n) return zero;
  return BN(n, base);
}

export function convertDecimals(
  n: BN.Value,
  sourceDecimals: number,
  targetDecimals: number,
): BN {
  if (sourceDecimals === targetDecimals) return bn(n);
  else if (sourceDecimals > targetDecimals)
    return bn(n).idiv(ten.pow(sourceDecimals - targetDecimals));
  else return bn(n).times(ten.pow(targetDecimals - sourceDecimals));
}

export function eqIgnoreCase(a: string, b: string) {
  return a == b || a.toLowerCase() == b.toLowerCase();
}

export function parsebn(n: BN.Value, defaultValue?: BN, fmt?: BN.Format): BN {
  if (typeof n !== "string") return bn(n);

  const decimalSeparator = fmt?.decimalSeparator || ".";
  const str = n.replace(new RegExp(`[^${decimalSeparator}\\d-]+`, "g"), "");
  const result = bn(
    decimalSeparator === "." ? str : str.replace(decimalSeparator, "."),
  );
  if (defaultValue && (!result.isFinite() || result.lte(zero)))
    return defaultValue;
  else return result;
}

export const isNativeAddress = (address?: string) =>
  !!nativeTokenAddresses.find((a) => eqIgnoreCase(a, address || ""));

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export const safeInteger = (value?: string) => {
  if (!value || value === "NaN") return "0";
  return BN.min(BN(value || "0").toString(), maxUint256)
    .decimalPlaces(0)
    .toFixed();
};

export const safeBNString = (value?: string | number) => {
  if (!value || value === "NaN") return "0";
  return BN(value).decimalPlaces(0).toFixed();
};

export const safeBNNumber = (value?: string | number) => {
  if (!value || value === "NaN") return 0;
  return BN(value).decimalPlaces(0).toNumber();
};

export const getNetwork = (chainId?: number): Network | undefined => {
  return Object.values(networks).find((it) => it.id === chainId);
};

export const ensureWrappedToken = (token: Token, chainId: number): Token => {
  const network = getNetwork(chainId);
  if (!network || !isNativeAddress(token.address)) return token;
  return network.wToken;
};

export const shouldWrapOnly = (
  inputToken?: Token,
  outputToken?: Token,
  chainId?: number,
): boolean => {
  const wrappedTokenAddress = getNetwork(chainId)?.wToken.address;
  return Boolean(
    isNativeAddress(inputToken?.address) &&
      wrappedTokenAddress &&
      eqIgnoreCase(outputToken?.address || "", wrappedTokenAddress),
  );
};

export const shouldUnwrapOnly = (
  inputToken?: Token,
  outputToken?: Token,
  chainId?: number,
): boolean => {
  const wrappedTokenAddress = getNetwork(chainId)?.wToken.address;
  return Boolean(
    wrappedTokenAddress &&
      eqIgnoreCase(inputToken?.address || "", wrappedTokenAddress) &&
      isNativeAddress(outputToken?.address),
  );
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

export const getExplorerUrl = (txHash?: string, chainId?: number): string => {
  const explorer = getNetwork(chainId)?.explorer;
  return explorer && txHash ? `${explorer}/tx/${txHash}` : "";
};

export const getExchanges = (config?: Config[]) => {
  if (!config) return undefined;
  const keys = config.map((c) => getPartnerIdentifier(c));

  const legacyAddresses = Object.entries(LEGACY_EXCHANGES_MAP)
    .filter(([key]) => {
      return keys.includes(key);
    })
    .flatMap(([, addresses]) => addresses);
  const exchangeAddresses = config.map((c) => c.exchangeAddress);

  const allAddresses = new Set(
    [...exchangeAddresses, ...legacyAddresses].map((a) => a.toLowerCase()),
  );

  return Array.from(allAddresses);
};

export const numberToHex = (value: number | bigint, padding = 0): string => {
  if (typeof value !== "bigint" && !Number.isSafeInteger(value)) {
    throw new Error("Value must be a safe integer or bigint");
  }

  // Convert to BigInt for consistency
  const bigVal = BigInt(value);

  // Convert to hex without 0x prefix
  let hex = bigVal.toString(16);

  // Apply zero-padding if requested (e.g., 32 bytes = 64 chars)
  if (padding > 0) {
    hex = hex.padStart(padding, "0");
  }

  return "0x" + hex;
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

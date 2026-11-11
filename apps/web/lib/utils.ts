import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Currency, type WrappedNativeAction } from "./types";
import { Balances } from "./types";
import BN from "bignumber.js";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import _ from "lodash";
import { wCurrencies } from "./wrapped-currencies";
import {
  BUNGEE_NATIVE_TOKEN_ADDRESS,
  DEFAULT_TOKENS,
  NATIVE_TOKENS_LOGO_URLS,
  POPULAR_TOKENS,
} from "./consts";
import { OrderVariant, Partners } from "@orbs-network/spot-react";
import { getChain } from "./chains";

export const getBaseCurrencies = (chainId?: number) => {
  return POPULAR_TOKENS[chainId as keyof typeof POPULAR_TOKENS] ?? [];
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const eqCompare = (a: string, b: string) => {
  return a.toLowerCase() === b.toLowerCase();
};

const nativeTokenAddresses = new Set([
  zeroAddress,
  BUNGEE_NATIVE_TOKEN_ADDRESS.toLowerCase(),
  "0x0000000000000000000000000000000000001010",
  "0x000000000000000000000000000000000000dead",
  "0x000000000000000000000000000000000000800a",
]);

export const isNativeAddress = (address?: string) =>
  nativeTokenAddresses.has(address?.toLowerCase() ?? "");

export const getWrappedNativeCurrency = (chainId?: number): Currency | undefined => {
  if(!chainId) return undefined;
  return wCurrencies[chainId];
};

export const getWrappedNativeAction = (
  inputAddress?: string,
  outputAddress?: string,
  chainId?: number,
): WrappedNativeAction | undefined => {
  const wrappedAddress = getWrappedNativeCurrency(chainId)?.address;
  if (!inputAddress || !outputAddress || !wrappedAddress) return undefined;

  if (
    isNativeAddress(inputAddress) &&
    eqCompare(outputAddress, wrappedAddress)
  ) {
    return "wrap";
  }

  if (
    eqCompare(inputAddress, wrappedAddress) &&
    isNativeAddress(outputAddress)
  ) {
    return "unwrap";
  }

  return undefined;
};

export const sortByBaseAssets = (currencies: Currency[], chainId?: number) => {
  const baseAddresses = new Set(
    getBaseCurrencies(chainId).map((address) => address.toLowerCase()),
  );
  return currencies.sort((a, b) => {
    const baseA = baseAddresses.has(a.address.toLowerCase());
    const baseB = baseAddresses.has(b.address.toLowerCase());

    if (baseA !== baseB) {
      return baseA ? -1 : 1; // base first
    }

    return 0;
  });
};

export const sortTokens = (
  currencies: Currency[],
  balances?: Balances
) => {
  const hasBalanceMap = new Map<string, boolean>();

  for (const currency of currencies) {
    const raw = balances?.[currency.address] ?? "0";
    hasBalanceMap.set(currency.address, BN(raw.toString()).gt(0));
  }

  const res = [...currencies].sort((a, b) => {
    const hasBalanceA = hasBalanceMap.get(a.address) ?? false;
    const hasBalanceB = hasBalanceMap.get(b.address) ?? false;
    if (hasBalanceA !== hasBalanceB) return hasBalanceA ? -1 : 1;

    return 0;
  });

  const uniqueRes = _.uniqBy(res, (t) => t.address.toLowerCase());
  const nativeIndex = uniqueRes.findIndex((t) => isNativeAddress(t.address));
  if (nativeIndex !== -1) {
    const native = uniqueRes[nativeIndex];
    uniqueRes.splice(nativeIndex, 1);
    uniqueRes.unshift(native);
  }

  return uniqueRes;
};

const trimFraction = (fraction: string, scale: number): string =>
  fraction.slice(0, scale).replace(/0+$/, "");

const formatSmallFraction = (
  fraction: string,
  scale: number,
  maxDecimals: number,
): string | undefined => {
  const firstSignificantIndex = fraction.search(/[^0]/);
  if (firstSignificantIndex === -1 || firstSignificantIndex + 1 > maxDecimals) {
    return undefined;
  }
  const significant = trimFraction(fraction.slice(firstSignificantIndex), scale);
  if (!significant) return undefined;
  // Keep leading fractional zeros so tiny values retain their first significant digits.
  return `0.${fraction.slice(0, firstSignificantIndex)}${significant}`;
};

/** Truncate for display; raw execution amounts must retain their original precision. */
export function formatDecimals(
  value?: string,
  scale = 6,
  maxDecimals = 8
): string {
  if (!value) return "";

  const sign = value.startsWith("-") ? "-" : "";
  const abs = sign ? value.slice(1) : value;
  const [intPart, rawDec = ""] = abs.split(".");

  if (!rawDec || Number(rawDec) === 0) return sign + intPart;

  if (intPart !== "0") {
    const fraction = trimFraction(rawDec, scale);
    return sign + intPart + (fraction ? `.${fraction}` : "");
  }

  const smallValue = formatSmallFraction(rawDec, scale, maxDecimals);
  return smallValue ? sign + smallValue : "0";
}

export const parseNativeCurrencyAddress = (
  address: string,
  chainId: number
) => {
  if (isNativeAddress(address)) {
    return getWrappedNativeCurrency(chainId)?.address ?? "";
  }
  return address;
};

export const getNativeTokenLogoUrl = (chainId: number) => {
  return (
    NATIVE_TOKENS_LOGO_URLS[chainId as keyof typeof NATIVE_TOKENS_LOGO_URLS] ??
    ""
  );
};

export const getDefaultTokensForChain = (chainId = 56) => {
  const defaultTokens = DEFAULT_TOKENS[chainId as keyof typeof DEFAULT_TOKENS];
  if (!defaultTokens) {
    return undefined;
  }
  return defaultTokens;
};

export const getChainName = (chainId: number) => {
  return getChain(chainId)?.name ?? "";
};

export const getNativeTokenSymbol = (chainId: number) => {
  return getChain(chainId)?.nativeCurrency.symbol ?? "";
};

export const getPopularTokenForChain = (chainId?: number) => {
  return getBaseCurrencies(chainId);
};

export const fillDelayText = (value?: number) => {
  if (!value) return "";
  const secondsTotal = Math.floor(value / 1000);
  const days = Math.floor(secondsTotal / (24 * 60 * 60));
  const hours = Math.floor((secondsTotal % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((secondsTotal % (60 * 60)) / 60);
  const seconds = secondsTotal % 60;
  const arr: string[] = [];
  if (days) arr.push(`${days} days `);
  if (hours) arr.push(`${hours} hours `);
  if (minutes) arr.push(`${minutes} minutes`);
  if (seconds) arr.push(`${seconds} seconds`);
  return arr.join(" ");
};

export const makeEllipsisAddress = (
  address?: string,
  padding?: { start: number; end: number }
): string => {
  if (!address) return "";
  return `${address.substring(0, padding?.start || 6)}...${address.substring(
    address.length - (padding?.end || 5)
  )}`;
};

export const getExplorerUrl = (chainId?: number, txHash?: string) => {
  if (!chainId || !txHash) {
    return "";
  }
  const explorer = getChain(chainId)?.blockExplorers?.default;
  if (!explorer) {
    return "";
  }
  return `${explorer.url}/tx/${txHash}`;
};

export const getExplorerAddressUrl = (chainId?: number, address?: string) => {
  if (!chainId || !address) return "";
  const explorer = getChain(chainId)?.blockExplorers?.default;
  return explorer ? `${explorer.url}/address/${address}` : "";
};

export const filterCurrencies = (
  currencies?: Currency[],
  query?: string[]
): Currency[] => {
  if (!currencies || !query || query.length === 0) return currencies ?? [];

  const keys: (keyof Currency)[] = ["name", "symbol", "address"];
  const normalizedQuery = query.map((q) => q.toLowerCase());

  return currencies.filter((currency) =>
    keys.some((key) => {
      const value = currency[key];
      if (typeof value !== "string") return false;

      const lowerValue = value.toLowerCase();

      return normalizedQuery.some((q) => lowerValue.includes(q));
    })
  );
};


export function getFirstAndLastLetter(symbol?: string): string {
  if (!symbol) return "";
  const s = symbol.trim().toUpperCase();
  return s.length <= 1 ? s : `${s[0]}${s[s.length - 1]}`;
}


export const toAmountRaw = (value?: string, decimals?: number) => {
  if (decimals == null || !value) return "0";
  return parseUnits(value, decimals).toString();
};

export const toAmountUI = (value?: string, decimals?: number) => {
 try {
  if (decimals == null || !value) return "0";
  return formatUnits(BigInt(value), decimals);
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 } catch (error) {
  return "0";
 }
};


export const getSpotPartnerDemoLink = (partner?: string) => {
  if (!partner) return undefined;
  switch (partner) {
    case Partners.Spooky:
      return "https://spookyswap-v2.netlify.app/#/swap/twap";
    case Partners.Thena:
      return "https://thena-frontend-mu.vercel.app/swap?inputCurrency=BNB&outputCurrency=0xf4c8e32eadec4bfe97e0f595add0f4450a863a11&swapType=2";
    case Partners.Lynex:
      return "https://defi-zoo-frontend-3pc5.vercel.app/swap?inputCurrency=ETH&outputCurrency=0x1a51b19CE03dbE0Cb44C1528E34a7EDD7771E9Af&swapType=2";
    case Partners.Nami:
      return "https://nami-dex.vercel.app/swap";
    case Partners.Quick:
      return "http://198.20.104.22:4000/swap/twap/ETH/0xc2132D05D31c914a87C6611C10748AEb04B58e8F?chainId=137";
    case Partners.Swapx:
      return "https://swapx-twap.netlify.app/swap?tokenIn=0x0000000000000000000000000000000000000000&tokenOut=0xA04BC7140c26fc9BB1F36B1A604C7A5a88fb0E70&view=TWAP";
    case Partners.Yowie:
      return "https://yowie-spot.netlify.app/twap";
    case Partners.Blackhole:
      return "https://blackhole-spot.netlify.app/swap?token0=0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7&token1=0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e&panel=twap";
  }
};

export const getSpotPartnerProdLink = (partner?: string) => {
  if (!partner) return undefined;
  switch (partner) {
    case Partners.Spooky:
      return "https://spooky.fi/#/swap/twap";
    case Partners.Thena:
      return "https://thena.fi/swap?inputCurrency=BNB&outputCurrency=0xf4c8e32eadec4bfe97e0f595add0f4450a863a11&swapType=2";
    case Partners.Lynex:
      return "https://app.lynex.fi/swap?inputCurrency=ETH&outputCurrency=0x1a51b19CE03dbE0Cb44C1528E34a7EDD7771E9Af&swapType=2";
    default:
      return undefined;
  }
};



export const getOrderTitle = (type?: OrderVariant): string => {
  if (!type) return "";
  switch (type) {
    case OrderVariant.SWAP:
      return "Swap";
    case OrderVariant.LIMIT:
      return "Limit";
    case OrderVariant.TWAP_LIMIT:
      return "TWAP Limit";
    case OrderVariant.TWAP_MARKET:
      return "TWAP Market";
    case OrderVariant.TAKE_PROFIT_MARKET:
      return "Take Profit Market";
    case OrderVariant.TAKE_PROFIT_LIMIT:
      return "Take Profit Limit";
    case OrderVariant.STOP_LOSS_LIMIT:
      return "Stop Loss Limit";
    case OrderVariant.STOP_LOSS_MARKET:
      return "Stop Loss Market";
    default:
      return type || "";
  }
};

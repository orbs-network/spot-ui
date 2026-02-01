import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Currency, USDPrices } from "./types";
import { Balances } from "./types";
import BN from "bignumber.js";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import _ from "lodash";
import { wCurrencies } from "./wrapped-currencies";
import {
  DEFAULT_TOKENS,
  NATIVE_TOKENS_LOGO_URLS,
  POPULAR_TOKENS,
} from "./consts";
import * as chains from "viem/chains";
import { Partners } from "@orbs-network/spot-ui";

export const getBaseCurrencies = (chainId?: number) => {
  return POPULAR_TOKENS[chainId as keyof typeof POPULAR_TOKENS] ?? [];
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const eqCompare = (a: string, b: string) => {
  return a.toLowerCase() === b.toLowerCase();
};

export const isNativeAddress = (address?: string) => {
  return eqCompare(address ?? "", zeroAddress);
};

export const getWrappedNativeCurrency = (chainId?: number): Currency | undefined => {
  if(!chainId) return undefined;
  return wCurrencies[chainId];
};

const isBaseToken = (t: Currency, chainId?: number) => {
  const baseCurrencies = getBaseCurrencies(chainId).map((t) => t.toLowerCase());
  return baseCurrencies.includes(t.address.toLowerCase());
};

export const sortByBaseAssets = (currencies: Currency[], chainId?: number) => {
  return currencies.sort((a, b) => {
    const baseA = isBaseToken(a, chainId);
    const baseB = isBaseToken(b, chainId);

    if (baseA !== baseB) {
      return baseA ? -1 : 1; // base first
    }

    return 0;
  });
};

export const sortTokens = (
  currencies: Currency[],
  usdPrices?: USDPrices,
  balances?: Balances
) => {
  const valueMap = new Map<string, number>(); // keep as number (you said losing precision is ok)

  // Pre-compute USD values
  for (const currency of currencies) {
    const raw = balances?.[currency.address] ?? "0";

    // Format balance -> decimal string -> number
    const balance = Number(
      BN(formatUnits(BigInt(raw.toString()), currency.decimals))
        .decimalPlaces(6)
        .toString()
    );

    const usdPrice = usdPrices?.[currency.address] ?? 0;
    const usdValue = balance * usdPrice;

    valueMap.set(currency.address, usdValue);
  }

  const res = [...currencies].sort((a, b) => {
    const valueA = valueMap.get(a.address) ?? 0;
    const valueB = valueMap.get(b.address) ?? 0;

    // 1. Primary: USD value DESC
    if (valueA !== valueB) {
      return valueB - valueA; // DESC
    }

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

export function formatDecimals(
  value?: string,
  scale = 6,
  maxDecimals = 8
): string {
  if (!value) return "";

  // ─── keep the sign, work with the absolute value ────────────────
  const sign = value.startsWith("-") ? "-" : "";
  const abs = sign ? value.slice(1) : value;

  const [intPart, rawDec = ""] = abs.split(".");

  // Fast-path: decimal part is all zeros (or absent) ───────────────
  if (!rawDec || Number(rawDec) === 0) return sign + intPart;

  /** Case 1 – |value| ≥ 1 *****************************************/
  if (intPart !== "0") {
    const sliced = rawDec.slice(0, scale);
    const cleaned = sliced.replace(/0+$/, ""); // drop trailing zeros
    const trimmed = cleaned ? "." + cleaned : "";
    return sign + intPart + trimmed;
  }

  /** Case 2 – |value| < 1 *****************************************/
  const firstSigIdx = rawDec.search(/[^0]/); // first non-zero position
  if (firstSigIdx === -1) return "0"; // decimal part is all zeros
  if (firstSigIdx + 1 > maxDecimals) return "0"; // too many leading zeros → 0

  const leadingZeros = rawDec.slice(0, firstSigIdx); // keep them
  const significantRaw = rawDec.slice(firstSigIdx).slice(0, scale);
  const significant = significantRaw.replace(/0+$/, ""); // trim trailing zeros

  return significant ? sign + "0." + leadingZeros + significant : "0";
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
  return (
    Object.values(chains).find((chain) => chain.id === chainId)?.name ?? ""
  );
};

export const getPopularTokenForChain = (chainId?: number) => {
  if (!chainId) {
    return [];
  }
  return POPULAR_TOKENS[chainId as keyof typeof POPULAR_TOKENS] ?? [];
};

export const makeElipsisAddress = (
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
  const explorer = Object.values(chains).find((chain) => chain.id === chainId)
    ?.blockExplorers?.default;
  if (!explorer) {
    return "";
  }
  return `${explorer.url}/tx/${txHash}`;
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

export const toAmountWei  = (value?: string, decimals?: number) => {

  if (!decimals || !value) return "0";
  return parseUnits(value, decimals).toString();
}

export const toAmountUI  = (value?: string, decimals?: number) => {
  if (!decimals || !value) return "0";
  return formatUnits(BigInt(value), decimals);
}





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


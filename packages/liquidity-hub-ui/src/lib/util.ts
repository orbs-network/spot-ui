import { nativeTokenAddresses } from "./consts";
import { Quote } from "./types";

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getApiUrl = (chainId: number) => {
  try {
    if (typeof window !== 'undefined') {
      const overrideUrl = localStorage.getItem("lhOverrideApiUrl");
      if (overrideUrl) return overrideUrl;
    }
  } catch (error) {}

  switch (chainId) {
    case 137:
      return "https://polygon.hub.orbs.network";
    case 56:
      return "https://bsc.hub.orbs.network";
    case 250:
      return "https://ftm.hub.orbs.network";
    case 8453:
      return "https://base.hub.orbs.network";
    case 59144:
      return "https://linea.hub.orbs.network";
    case 81457:
      return "https://blast.hub.orbs.network";
    case 1101:
      return "https://zkevm.hub.orbs.network";
    case 146:
      return "https://sonic.hub.orbs.network";
    case 42161:
      return "https://arbi.hub.orbs.network";

    default:
      return "https://hub.orbs.network";
  }
};

export const devLog = (...args: any[]) => {
  try {
    if (typeof window !== 'undefined' && localStorage.getItem("lhDebug")) {
      console.log(...args, "LH log");
    }
  } catch (error) {}
};


export function eqIgnoreCase(a: string, b: string) {
  return a == b || a.toLowerCase() == b.toLowerCase();
}

export const isNativeAddress = (address?: string) =>
  !!nativeTokenAddresses.find((a) => eqIgnoreCase(a, address || ""));


export const isFreshQuote = (quote: Quote, maxAgeSeconds = 60) => {
  // quote.timestamp in milliseconds
  return Date.now() - quote.timestamp < maxAgeSeconds * 1000;
};
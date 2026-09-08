import { nativeTokenAddresses } from "./consts";
import type { Quote } from "./types";

const createAbortError = (signal?: AbortSignal): Error => {
  if (signal?.reason instanceof Error) return signal.reason;

  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
};

export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

export const toError = (error: unknown, fallback = "Unknown error"): Error => {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error) return new Error(error);
  return new Error(fallback);
};

export const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw createAbortError(signal);
};

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(createAbortError(signal));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

const normalizeApiUrl = (apiUrl: string): string => {
  const normalized = apiUrl.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("Liquidity Hub apiUrl must not be empty");
  }
  return normalized;
};

export const getApiUrl = (chainId: number, apiUrl?: string): string => {
  if (apiUrl !== undefined) return normalizeApiUrl(apiUrl);

  try {
    if (typeof window !== "undefined") {
      const overrideUrl = localStorage.getItem("lhOverrideApiUrl");
      if (overrideUrl) return normalizeApiUrl(overrideUrl);
    }
  } catch {}

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

export const devLog = (...args: unknown[]): void => {
  try {
    if (typeof window !== "undefined" && localStorage.getItem("lhDebug")) {
      console.log(...args, "LH log");
    }
  } catch {}
};

export function eqIgnoreCase(a: string, b: string): boolean {
  return a === b || a.toLowerCase() === b.toLowerCase();
}

export const isNativeAddress = (address?: string): boolean =>
  nativeTokenAddresses.some((candidate) =>
    eqIgnoreCase(candidate, address ?? ""),
  );

export const isFreshQuote = (quote: Quote, maxAgeSeconds = 60): boolean => {
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0) return false;

  const ageMillis = Date.now() - quote.timestamp;
  return (
    Number.isFinite(quote.timestamp) &&
    ageMillis >= 0 &&
    ageMillis < maxAgeSeconds * 1_000
  );
};

export const isLiquidityHubBetter = (
  quote: Quote | null | undefined,
  dexMinAmountOut?: string,
): boolean => {
  if (!quote || !dexMinAmountOut) return false;

  try {
    return BigInt(quote.minAmountOut) > BigInt(dexMinAmountOut);
  } catch {
    return false;
  }
};

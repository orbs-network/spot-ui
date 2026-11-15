import BN from "bignumber.js";
import { getApiEndpoint } from "./api-config";
import { awaitWithSignal } from "./await-with-signal";
import { SpotError } from "./errors";

const TOKEN_USD_CACHE_TTL_MILLIS = 10 * 60_000;
const TOKEN_USD_PENDING_TTL_MILLIS = 30_000;
const MAX_CACHED_TOKEN_PRICES = 128;

interface TokenUsdCacheEntry {
  promise: Promise<string>;
  expiresAt: number;
}

const tokenUsdCache = new Map<string, TokenUsdCacheEntry>();

/** Inputs for reading the USD unit price of an ERC-20 token. */
export interface GetTokenUsdParams {
  /** Token address on the requested chain; use the wrapped token for native input. */
  tokenAddress: string;
  /** Positive EVM chain ID, such as 56 for BNB Smart Chain. */
  chainId: number;
  /** Cancels this caller's wait; shared lookups continue for other callers. */
  signal?: AbortSignal;
  /** Explicit order-service base URL; defaults to production v2. */
  apiUrl?: string;
}

/**
 * Reads USD per whole token from the order service, without loading a client.
 * Returns a decimal string, preserving the service's full price precision.
 * Shares pending lookups and caches successful prices for 10 minutes across calls
 * and clients, keyed by endpoint, chain, and token. Failures are not cached.
 *
 * @param params - Token, chain, and optional abort signal and service base URL.
 * @returns USD price per whole token, for example `"670.51070305"`.
 * @throws `SpotError` for invalid arguments, failed lookups, or invalid responses.
 * Request cancellation propagates unchanged.
 * @example
 * const usdPerToken = await getTokenUsd({ tokenAddress, chainId: 56, signal });
 */
export async function getTokenUsd({
  tokenAddress,
  chainId,
  signal,
  apiUrl,
}: GetTokenUsdParams): Promise<string> {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new SpotError("INVALID_ARGUMENT", "chainId must be a positive safe integer");
  }
  if (typeof tokenAddress !== "string" || !/^0x[0-9a-f]{40}$/i.test(tokenAddress)) {
    throw new SpotError("INVALID_ARGUMENT", "tokenAddress must be an EVM address");
  }
  const endpoint = getApiEndpoint(apiUrl);
  const normalizedToken = tokenAddress.toLowerCase();
  const key = JSON.stringify([endpoint, chainId, normalizedToken]);
  const now = Date.now();
  for (const [cachedKey, cached] of tokenUsdCache) {
    if (cached.expiresAt <= now) tokenUsdCache.delete(cachedKey);
  }
  let entry = tokenUsdCache.get(key);
  if (entry) {
    tokenUsdCache.delete(key);
    tokenUsdCache.set(key, entry);
  } else {
    const pending: TokenUsdCacheEntry = {
      promise: loadTokenUsd(normalizedToken, chainId, endpoint),
      // Expire pending entries too, so a hung request cannot pin future lookups.
      expiresAt: now + TOKEN_USD_PENDING_TTL_MILLIS,
    };
    pending.promise = pending.promise.then(price => {
      pending.expiresAt = Date.now() + TOKEN_USD_CACHE_TTL_MILLIS;
      return price;
    }, error => {
      if (tokenUsdCache.get(key) === pending) tokenUsdCache.delete(key);
      throw error;
    });
    tokenUsdCache.set(key, pending);
    while (tokenUsdCache.size > MAX_CACHED_TOKEN_PRICES) {
      const oldestKey = tokenUsdCache.keys().next().value;
      if (oldestKey !== undefined) tokenUsdCache.delete(oldestKey);
    }
    entry = pending;
  }
  return awaitWithSignal(entry.promise, signal);
}

/** Fetches independently of any one caller's abort signal so shared work stays reusable. */
async function loadTokenUsd(tokenAddress: string, chainId: number, endpoint: string): Promise<string> {
  const query = new URLSearchParams({ chainId: String(chainId) });
  let response: Response;
  try {
    response = await fetch(`${endpoint}/price/${tokenAddress}?${query}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new SpotError("PRICE_LOOKUP_FAILED", "Unable to fetch token USD price", { cause });
  }
  if (!response.ok) {
    throw new SpotError("PRICE_LOOKUP_FAILED", `Unable to fetch token USD price (HTTP ${response.status})`, {
      status: response.status,
    });
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new SpotError("INVALID_RESPONSE", "Invalid token price response: expected JSON", {
      status: response.status, cause,
    });
  }
  const payload = data as { token?: unknown; priceUsd?: unknown } | null;
  if (!payload || typeof payload.token !== "string" ||
      payload.token.toLowerCase() !== tokenAddress.toLowerCase() ||
      typeof payload.priceUsd !== "string" || !/^\d+$/.test(payload.priceUsd) ||
      !new BN(payload.priceUsd).gt(0)) {
    throw new SpotError("INVALID_RESPONSE", "Invalid token price response: expected a positive price for the requested token", {
      status: response.status,
    });
  }
  // priceUsd uses 18 decimals independently of the token's decimals metadata.
  return new BN(payload.priceUsd).shiftedBy(-18).toFixed();
}

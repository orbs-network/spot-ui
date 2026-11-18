import BN from "bignumber.js";
import { getApiEndpoint } from "./api-config";
import { awaitWithSignal } from "./await-with-signal";
import { SpotError } from "./errors";

/** Inputs for reading the USD unit price of an ERC-20 token. */
export interface GetTokenUsdParams {
  /** Token address on the requested chain; use the wrapped token for native input. */
  tokenAddress: string;
  /** Positive EVM chain ID, such as 56 for BNB Smart Chain. */
  chainId: number;
  /** Cancels this price request. */
  signal?: AbortSignal;
}

/** Inputs for reading USD unit prices for multiple ERC-20 tokens in one request. */
export interface GetTokensUsdParams {
  /** Token addresses on the requested chain; use wrapped tokens for native inputs. */
  tokenAddresses: readonly string[];
  /** Positive EVM chain ID, such as 56 for BNB Smart Chain. */
  chainId: number;
  /** Cancels this batch price request. */
  signal?: AbortSignal;
}

/**
 * Reads USD per whole token from the default production service, without loading a client.
 * Returns a decimal string, preserving the service's full price precision.
 * Makes a new request on every call, without caching prices or sharing pending work.
 *
 * @param params - Token, chain, and optional abort signal.
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
}: GetTokenUsdParams): Promise<string> {
  signal?.throwIfAborted();
  validateChainId(chainId);
  validateTokenAddress(tokenAddress);
  return awaitWithSignal(loadTokenUsd(tokenAddress.toLowerCase(), chainId, signal), signal);
}

/**
 * Reads USD per whole token in one POST request to the default production service.
 * Returns full-precision decimal strings keyed by lowercase token addresses.
 * Duplicate addresses are requested once; an empty list returns `{}` without fetching.
 * Every call is independent, without caching prices or sharing pending work.
 *
 * @throws `SpotError` for invalid arguments, failed lookups, or missing/malformed
 * requested prices. Unrelated response entries are ignored. Cancellation propagates unchanged.
 * @example
 * const prices = await getTokensUsd({ tokenAddresses: [inToken, outToken], chainId: 56, signal });
 * const inputTokenUsdPrice = prices[inToken.toLowerCase()];
 */
export async function getTokensUsd({
  tokenAddresses,
  chainId,
  signal,
}: GetTokensUsdParams): Promise<Record<string, string>> {
  signal?.throwIfAborted();
  validateChainId(chainId);
  if (!Array.isArray(tokenAddresses)) {
    throw new SpotError("INVALID_ARGUMENT", "tokenAddresses must be an array of EVM addresses");
  }
  const addresses = [...new Set(Array.from(tokenAddresses, tokenAddress => {
    validateTokenAddress(tokenAddress);
    return tokenAddress.toLowerCase();
  }))];
  if (addresses.length === 0) return {};
  return awaitWithSignal(loadTokensUsd(addresses, chainId, signal), signal);
}

function validateChainId(chainId: number): void {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new SpotError("INVALID_ARGUMENT", "chainId must be a positive safe integer");
  }
}

function validateTokenAddress(tokenAddress: string): void {
  if (typeof tokenAddress !== "string" || !/^0x[0-9a-f]{40}$/i.test(tokenAddress)) {
    throw new SpotError("INVALID_ARGUMENT", "tokenAddress must be an EVM address");
  }
}

async function loadTokenUsd(tokenAddress: string, chainId: number, signal?: AbortSignal): Promise<string> {
  const query = new URLSearchParams({ chainId: String(chainId) });
  const { data, status } = await loadPriceData(`/price/${tokenAddress}?${query}`, signal);
  return parseTokenUsd(data, tokenAddress, status);
}

async function loadTokensUsd(
  tokenAddresses: readonly string[],
  chainId: number,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const { data, status } = await loadPriceData("/prices", signal, JSON.stringify({ chainId, tokenAddresses }));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new SpotError("INVALID_RESPONSE", "Invalid token prices response: expected an address-keyed object", { status });
  }
  const payloads = new Map(Object.entries(data).map(([address, payload]) => [address.toLowerCase(), payload]));
  return Object.fromEntries(tokenAddresses.map(tokenAddress => [
    tokenAddress,
    parseTokenUsd(payloads.get(tokenAddress), tokenAddress, status),
  ]));
}

async function loadPriceData(
  path: string,
  signal?: AbortSignal,
  body?: string,
): Promise<{ data: unknown; status: number }> {
  let response: Response;
  try {
    response = await fetch(`${getApiEndpoint()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined
        ? { Accept: "application/json" }
        : { Accept: "application/json", "Content-Type": "application/json" },
      body,
      cache: "no-store",
      signal,
    });
  } catch (cause) {
    signal?.throwIfAborted();
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
    signal?.throwIfAborted();
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new SpotError("INVALID_RESPONSE", "Invalid token price response: expected JSON", {
      status: response.status, cause,
    });
  }
  return { data, status: response.status };
}

function parseTokenUsd(data: unknown, tokenAddress: string, status: number): string {
  const payload = data as { token?: unknown; priceUsd?: unknown } | null;
  if (!payload || typeof payload.token !== "string" ||
      payload.token.toLowerCase() !== tokenAddress.toLowerCase() ||
      typeof payload.priceUsd !== "string" || !/^\d+$/.test(payload.priceUsd) ||
      !new BN(payload.priceUsd).gt(0)) {
    throw new SpotError("INVALID_RESPONSE", "Invalid token price response: expected a positive price for the requested token", {
      status,
    });
  }
  // priceUsd uses 18 decimals independently of the token's decimals metadata.
  return new BN(payload.priceUsd).shiftedBy(-18).toFixed();
}

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
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new SpotError("INVALID_ARGUMENT", "chainId must be a positive safe integer");
  }
  if (typeof tokenAddress !== "string" || !/^0x[0-9a-f]{40}$/i.test(tokenAddress)) {
    throw new SpotError("INVALID_ARGUMENT", "tokenAddress must be an EVM address");
  }
  return awaitWithSignal(loadTokenUsd(tokenAddress.toLowerCase(), chainId, signal), signal);
}

async function loadTokenUsd(tokenAddress: string, chainId: number, signal?: AbortSignal): Promise<string> {
  const query = new URLSearchParams({ chainId: String(chainId) });
  let response: Response;
  try {
    response = await fetch(`${getApiEndpoint()}/price/${tokenAddress}?${query}`, {
      method: "GET",
      headers: { Accept: "application/json" },
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

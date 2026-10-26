import { getApiEndpoint } from "./api-config";
import type { Partners } from "./types";
import { getSlippageBps } from "./swap-amounts";

/** Inputs for an exact-input quote. Token amounts use integer base-unit strings. */
export interface SwapQuoteParams {
  /** Active chain ID, normally taken from a reused SpotClient. */
  chainId: number;
  /** Spot integration partner, matching the client used to submit the order. */
  partner: Partners;
  /** ERC-20 input address; use the chain's wrapped token for native input. */
  inToken: string;
  /** Complete input amount as an integer string in input-token base units. */
  inAmount: string;
  /** Output token address on the selected chain. */
  outToken: string;
  /**
   * Account that will sign the order. Before connection, a host can use
   * `0x0000000000000000000000000000000000000001` for a display-only preview.
   * Refetch with the connected account after connection or an account change;
   * a preview quote cannot be submitted for a different signer.
   */
  user: string;
  /** Percentage: 0.5 means 0.5%. Sent to the API as integer basis points, rounded to the nearest bps. Does not set the signed order's slippage field. */
  slippage: number;
  /** DEX minimum output in output-token base units. Defaults to "-1" when no DEX quote is available. */
  dexMinAmountOut?: string;
  /** Cancels this HTTP request; no wallet operation or order is created. */
  signal?: AbortSignal;
}

/** Quote response with the request identity needed to validate later preparation. */
export interface SwapQuote {
  /** Frozen identity of the request that produced this quote. Never a signing payload. */
  readonly request: Readonly<Omit<SwapQuoteParams, "signal">>;
  /** Local receipt time in milliseconds, not a server guarantee of expiry. */
  readonly receivedAt: number;
  /** Raw output amount reported by the quote service. */
  amountOut: string;
  /** Net output-token base units. Pass as calculateOrder.quotedOutputAmountRaw. */
  netAmountOut: string;
  /** Service-provided minimum. The host may derive its own UI-slippage minimum from netAmountOut. */
  minimumAmountOut: string;
  /** Raw fee amount reported by the quote service. */
  feeAmount: string;
}

const isAmount = (value: unknown): value is string =>
  typeof value === "string" && /^\d+$/.test(value);

/**
 * Fetches an exact-input swap quote for a token pair and signer.
 * Use the result with `submitSwap` or `client.prepareSwap`, or pass
 * `netAmountOut` to `calculateOrder` with `Module.SWAP` for a form preview.
 * This request does not open the wallet or create an order.
 *
 * @param params - Chain, partner, tokens, raw input amount, signer, and slippage percentage.
 * @returns The service amounts and a frozen copy of the request, all amounts in base units.
 * @throws {@link QuoteError} for invalid slippage, unavailable quotes, or request/response failures.
 * Request cancellation propagates the abort error instead of a QuoteError.
 */
export const getQuote = async ({
  chainId, partner, inToken, inAmount, outToken, user, slippage,
  dexMinAmountOut = "-1", signal,
}: SwapQuoteParams): Promise<SwapQuote> => {
  let slippageBps: number;
  try { slippageBps = getSlippageBps(slippage); }
  catch (error) { throw new QuoteError(error instanceof Error ? error.message : "Invalid slippage", "invalid-request"); }
  const query = new URLSearchParams({ chainId: String(chainId), partner });
  let response: Response;
  try { response = await fetch(`${getApiEndpoint()}/quote?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ inToken, inAmount, outToken, user, slippage: slippageBps, outAmount: dexMinAmountOut }),
    signal,
  }); } catch (error) {
    // Caller cancellation remains cancellation, not a retryable venue failure.
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new QuoteError(error instanceof Error ? error.message : "Unable to fetch swap quote", "network");
  }
  // Error responses from proxies can be HTML or empty; keep the HTTP failure readable.
  let data;
  try { data = await response.json(); }
  catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
  }
  signal?.throwIfAborted();
  if (!response.ok || response.status === 204) {
    const error = data?.error;
    const code = data?.code ?? (typeof error === "object" ? error?.code : undefined);
    const message = data?.message ?? (typeof error === "string" ? error : error?.message);
    throw new QuoteError(typeof message === "string" ? message : "Unable to fetch swap quote",
      response.status === 204 ? "no-quote" : "http", response.status,
      typeof code === "string" || typeof code === "number" ? code : undefined);
  }
  if (
    !isAmount(data?.amountOut) || !isAmount(data?.netAmountOut) ||
    !isAmount(data?.minimumAmountOut) || !isAmount(data?.feeAmount) ||
    BigInt(data.netAmountOut) <= BigInt(0) ||
    BigInt(data.minimumAmountOut) <= BigInt(0) ||
    BigInt(data.minimumAmountOut) > BigInt(data.netAmountOut)
  ) {
    throw new QuoteError("No executable swap quote available", "invalid-response", response.status);
  }
  return Object.freeze({
    request: Object.freeze({ chainId, partner, inToken, inAmount, outToken, user, slippage, dexMinAmountOut }),
    receivedAt: Date.now(),
    amountOut: data.amountOut,
    netAmountOut: data.netAmountOut,
    minimumAmountOut: data.minimumAmountOut,
    feeAmount: data.feeAmount,
  });
};

export type QuoteErrorKind = "invalid-request" | "network" | "http" | "no-quote" | "invalid-response";

/**
 * Quote failure classified by `kind`, with optional HTTP `status` and service `code`.
 * `retryable` is true for network failures, HTTP 429, and HTTP 5xx responses.
 */
export class QuoteError extends Error {
  readonly name = "QuoteError";
  readonly retryable: boolean;
  constructor(message: string, readonly kind: QuoteErrorKind, readonly status?: number, readonly code?: string | number) {
    super(message);
    this.retryable = kind === "network" || status === 429 || (status !== undefined && status >= 500);
  }
}

/**
 * Checks whether a quote's local receipt age is within the host's allowed age.
 * This is a local freshness check, not a guarantee that a quote remains executable.
 *
 * @param quote - Quote returned by {@link getQuote}.
 * @param maxAgeMillis - Maximum accepted age in milliseconds, inclusive.
 * @param now - Current Unix time in milliseconds; defaults to `Date.now()`.
 * @returns False for expired quotes, future receipt times, or invalid ages.
 */
export function isQuoteFresh(quote: SwapQuote, maxAgeMillis: number, now = Date.now()): boolean {
  const age = now - quote.receivedAt;
  return Number.isFinite(maxAgeMillis) && maxAgeMillis >= 0 && Number.isFinite(age) && age >= 0 && age <= maxAgeMillis;
}

import type { Partners } from "./types";
import { createAnalytics, type AnalyticsContext, type SpotAnalytics } from "./analytics";
import { observe } from "./observe";
import { isQuoteAbortError, QuoteError } from "./quote-error";
import { fetchSwapQuote } from "./quote-request";

export { QuoteError, type QuoteErrorKind } from "./quote-error";

/** Inputs shared by exact-input and exact-output quotes. */
interface SwapQuoteBaseParams {
  /** Active chain ID, normally taken from a reused SpotClient. */
  chainId: number;
  /** Spot integration partner, matching the client used to submit the order. */
  partner: Partners;
  /** ERC-20 input address; use the chain's wrapped token for native input. */
  inToken: string;
  /** Output token address on the selected chain. */
  outToken: string;
  /**
   * Account supplied to the quote service. Before connection, a host can use
   * `0x0000000000000000000000000000000000000001` for a preview.
   * Pass the connected account separately as `account` when preparing or
   * submitting the swap; this quote field does not determine the signer.
   */
  user: string;
  /** DEX percentage from 0 through 50, inclusive: 0.5 means 0.5%. Rounded to integer basis points for the quote API and signed swap slippage; minimumAmountOut is preserved unchanged. */
  slippage: number;
  /** Optional local minimum for exact-input quotes: nonnegative uint256 output-token base units, or "-1". Never sent to the API. Output quotes accept only omitted or "-1". */
  dexMinAmountOut?: string;
  /** Cancels this HTTP request; no wallet operation or order is created. */
  signal?: AbortSignal;
  /** Explicit order-service base URL. Defaults to production v2. */
  apiUrl?: string;
}

/** Supply exactly one positive uint256 amount, in the selected token's base units. */
export type SwapQuoteParams = SwapQuoteBaseParams & (
  | { inAmount: string; outAmount?: never }
  | { inAmount?: never; outAmount: string }
);

/** Executable exact-input identity, including the server-resolved input for an output quote. */
export type SwapQuoteRequest = Readonly<Omit<SwapQuoteBaseParams, "signal" | "apiUrl"> & { inAmount: string }>;

/** Quote response with the request identity needed to validate later preparation. */
export interface SwapQuote {
  /** Frozen executable input identity. Refresh this fixed input; never a signing payload. */
  readonly request: SwapQuoteRequest;
  /** Original output target, when quoted by outAmount; request.inAmount is the executable spending amount. */
  readonly requestedOutAmount?: string;
  /** Local receipt time in milliseconds, not a server guarantee of expiry. */
  readonly receivedAt: number;
  /** Service-reported USD value of the input amount as a decimal string, when available. */
  inputAmountUsd?: string;
  /** Raw output amount reported by the quote service. */
  amountOut: string;
  /** Net output-token base units. Pass as calculateOrder.quotedOutputAmountRaw. */
  netAmountOut: string;
  /** Service-reported USD value of netAmountOut as a decimal string, when available. */
  netAmountOutUsd?: string;
  /** Service-provided minimum for the requested slippage. Use unchanged for review and the signed swap minimum. */
  minimumAmountOut: string;
  /** Service-reported USD value of minimumAmountOut as a decimal string, when available. */
  minimumAmountOutUsd?: string;
  /** Service-reported signed price impact in percent as a decimal string, when available. */
  priceImpactPercentage?: string;
  /** Raw fee amount reported by the quote service. */
  feeAmount: string;
}

/** Capture the reviewed minimum and request before later wallet/network awaits. */
export const snapshotSwapQuote = (quote: SwapQuote): SwapQuote => Object.freeze({
  ...quote,
  request: Object.freeze({ ...quote.request }),
});

/**
 * Fetches one swap quote for exactly one input amount or output target.
 * After the host confirms wrapping and allowance, pass the result to `client.prepareSwap`.
 * This request does not open the wallet or create an order.
 * Configure analytics on `createClient` and use `client.getQuote`; per-quote
 * `disableAnalytics` options are rejected before analytics or quote requests.
 *
 * @param params - Chain, partner, pair, exactly one raw inAmount or outAmount, quote user, and slippage percentage.
 * @returns Base-unit amounts, optional display metadata, and a frozen executable input request. Output targets also return requestedOutAmount.
 * @throws {@link QuoteError} for invalid inputs, unavailable quotes, or request/response failures.
 * Request cancellation propagates the abort error instead of a QuoteError.
 */
export const getQuote = async (params: SwapQuoteParams): Promise<SwapQuote> => {
  let reporter: SpotAnalytics;
  try {
    reporter = createAnalytics(getQuoteAnalyticsContext(params));
  } catch {
    reporter = createAnalytics({}, { disableAnalytics: true });
  }
  return fetchQuote(params, reporter);
};

const assertQuoteRequest = (params: SwapQuoteParams): void => {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new QuoteError("Quote params must be an object", "invalid-request");
  }
  if ("disableAnalytics" in params) {
    throw new QuoteError(
      "Quote requests do not accept disableAnalytics. Configure it in createClient options and use client.getQuote instead.",
      "invalid-request",
    );
  }
  if ((params.inAmount !== undefined) === (params.outAmount !== undefined)) {
    throw new QuoteError(
      "Quote requests require exactly one of inAmount or outAmount",
      "invalid-request",
    );
  }
};

/** Quote-user metadata remains separate from the account that may later sign. */
export const getQuoteAnalyticsContext = (params?: Partial<SwapQuoteParams>): AnalyticsContext => {
  try {
    return {
      chainId: params?.chainId,
      partner: params?.partner,
      quoteUser: params?.user,
      inputTokenAddress: params?.inToken,
      outputTokenAddress: params?.outToken,
      inputAmountRaw: params?.inAmount,
      quoteMode: params?.outAmount !== undefined ? "exactOut" : "exactIn",
      requestedOutputAmountRaw: params?.outAmount,
      slippagePercent: params?.slippage,
    };
  } catch {
    return {};
  }
};

/** Shared transport implementation; its caller chooses the telemetry operation. */
export const fetchQuote = async (
  params: SwapQuoteParams,
  reporter: SpotAnalytics,
): Promise<SwapQuote> => {
  assertQuoteRequest(params);
  try {
    params.signal?.throwIfAborted();
    const context = getQuoteAnalyticsContext(params);
    observe(() => reporter.onQuoteRequest(context));
    const quote = await fetchSwapQuote(params);
    params.signal?.throwIfAborted();
    observe(() => reporter.onQuoteSuccess({ context: { ...context, inputAmountRaw: quote.request.inAmount } }));
    return quote;
  } catch (error) {
    const aborted = params.signal?.aborted || isQuoteAbortError(error);
    if (!aborted) observe(() => reporter.onQuoteError(error));
    throw error;
  }
};

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
  if (!Number.isFinite(quote.receivedAt) || !Number.isFinite(now) ||
    !Number.isFinite(maxAgeMillis) || maxAgeMillis < 0) return false;
  const age = now - quote.receivedAt;
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMillis;
}

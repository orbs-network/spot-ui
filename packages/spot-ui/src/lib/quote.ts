import { getApiEndpoint } from "./api-config";
import type { Partners } from "./types";
import { getSlippageBps } from "./swap-amounts";
import { createAnalytics, type AnalyticsContext, type SpotAnalytics } from "./analytics";
import { observe } from "./observe";

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
   * Account supplied to the quote service. Before connection, a host can use
   * `0x0000000000000000000000000000000000000001` for a preview.
   * Pass the connected account separately as `account` when preparing or
   * submitting the swap; this quote field does not determine the signer.
   */
  user: string;
  /** Percentage: 0.5 means 0.5%. Sent to the API as integer basis points, rounded to the nearest bps. Does not set the signed order's slippage field. */
  slippage: number;
  /** Optional DEX minimum in output-token base units. Omitted or undefined sends outAmount: "-1" to the API. */
  dexMinAmountOut?: string;
  /** Cancels this HTTP request; no wallet operation or order is created. */
  signal?: AbortSignal;
  /** Explicit order-service base URL. Defaults to production v2. */
  apiUrl?: string;
}

/** Quote response with the request identity needed to validate later preparation. */
export interface SwapQuote {
  /** Frozen identity of the request that produced this quote. Never a signing payload. */
  readonly request: Readonly<Omit<SwapQuoteParams, "signal" | "apiUrl">>;
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

const isAmount = (value: unknown): value is string =>
  typeof value === "string" && /^\d+$/.test(value);
const isDecimal = (value: unknown): value is string =>
  typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value);
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

interface QuoteResponsePayload {
  amountOut?: unknown;
  netAmountOut?: unknown;
  minimumAmountOut?: unknown;
  feeAmount?: unknown;
  inputAmountUsd?: unknown;
  usdValue?: unknown;
  minimumAmountOutUsd?: unknown;
  netAmountOutUsd?: unknown;
  priceImpactPercentage?: unknown;
  error?: string | { code?: unknown; message?: unknown } | null;
  code?: unknown;
  message?: unknown;
}

const validateQuoteRequest = ({
  chainId, inToken, outToken, user, inAmount, slippage,
}: SwapQuoteParams): number => {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new QuoteError("chainId must be a positive safe integer", "invalid-request");
  }
  for (const [field, address] of [["inToken", inToken], ["outToken", outToken], ["user", user]] as const) {
    if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
      throw new QuoteError(`Invalid ${field} address`, "invalid-request");
    }
  }
  if (!isAmount(inAmount) || BigInt(inAmount) <= BigInt(0)) {
    throw new QuoteError("inAmount must be a positive integer base-unit amount", "invalid-request");
  }
  try {
    return getSlippageBps(slippage);
  } catch (error) {
    throw new QuoteError(error instanceof Error ? error.message : "Invalid slippage", "invalid-request");
  }
};

const getQuoteEndpoint = (apiUrl?: string): string => {
  try {
    return getApiEndpoint(apiUrl);
  } catch (error) {
    throw new QuoteError(error instanceof Error ? error.message : "Invalid apiUrl", "invalid-request");
  }
};

const readQuoteResponse = async (
  response: Response,
  signal?: AbortSignal,
): Promise<QuoteResponsePayload | undefined> => {
  try {
    return await response.json() as QuoteResponsePayload;
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    // Proxies can return HTML or an empty body; retain the HTTP failure below.
    return undefined;
  }
};

const quoteResponseError = (response: Response, data?: QuoteResponsePayload): QuoteError => {
  const error = data?.error;
  const code = data?.code ?? (typeof error === "object" ? error?.code : undefined);
  const message = data?.message ?? (typeof error === "string" ? error : error?.message);
  return new QuoteError(
    typeof message === "string" ? message : "Unable to fetch swap quote",
    response.status === 204 ? "no-quote" : "http",
    response.status,
    typeof code === "string" || typeof code === "number" ? code : undefined,
  );
};

const optionalDecimal = (value: unknown, field: string, status: number): string | undefined => {
  if (value === undefined || isDecimal(value)) return value;
  throw new QuoteError(`Invalid quote ${field}`, "invalid-response", status);
};

const parseQuoteAmounts = (
  data: QuoteResponsePayload | undefined,
  status: number,
): Omit<SwapQuote, "request" | "receivedAt"> => {
  if (
    !data || !isAmount(data.amountOut) || !isAmount(data.netAmountOut) ||
    !isAmount(data.minimumAmountOut) || !isAmount(data.feeAmount) ||
    BigInt(data.netAmountOut) <= BigInt(0) ||
    BigInt(data.minimumAmountOut) <= BigInt(0) ||
    BigInt(data.minimumAmountOut) > BigInt(data.netAmountOut)
  ) {
    throw new QuoteError("No executable swap quote available", "invalid-response", status);
  }

  // USD metadata is optional; malformed values still invalidate an otherwise executable quote.
  const inputAmountUsd = optionalDecimal(
    data.inputAmountUsd === undefined ? data.usdValue : data.inputAmountUsd,
    "inputAmountUsd",
    status,
  );
  const minimumAmountOutUsd = optionalDecimal(data.minimumAmountOutUsd, "minimumAmountOutUsd", status);
  const netAmountOutUsd = optionalDecimal(data.netAmountOutUsd, "netAmountOutUsd", status);
  const priceImpactPercentage = optionalDecimal(data.priceImpactPercentage, "priceImpactPercentage", status);
  return {
    inputAmountUsd,
    amountOut: data.amountOut,
    netAmountOut: data.netAmountOut,
    netAmountOutUsd,
    minimumAmountOut: data.minimumAmountOut,
    minimumAmountOutUsd,
    priceImpactPercentage,
    feeAmount: data.feeAmount,
  };
};

/**
 * Fetches an exact-input swap quote for a token pair and quote user.
 * Use the result with `client.createSwapExecution`.
 * This request does not open the wallet or create an order.
 * Configure analytics on `createClient` and use `client.getQuote`; per-quote
 * `disableAnalytics` options are rejected before analytics or quote requests.
 *
 * @param params - Chain, partner, tokens, raw input amount, quote user or preview address, and slippage percentage.
 * @returns The service's base-unit amounts, optional USD/price-impact metadata, and a frozen copy of the request.
 * @throws {@link QuoteError} for invalid inputs, unavailable quotes, or request/response failures.
 * Request cancellation propagates the abort error instead of a QuoteError.
 */
export const getQuote = async (params: SwapQuoteParams): Promise<SwapQuote> => {
  assertClientAnalyticsPolicy(params);
  let reporter: SpotAnalytics;
  try {
    reporter = createAnalytics(getQuoteAnalyticsContext(params));
  } catch {
    reporter = createAnalytics({}, { disableAnalytics: true });
  }
  return fetchQuote(params, reporter);
};

const assertClientAnalyticsPolicy = (params: SwapQuoteParams): void => {
  if (params && typeof params === "object" && "disableAnalytics" in params) {
    throw new QuoteError(
      "Quote requests do not accept disableAnalytics. Configure it in createClient options and use client.getQuote instead.",
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
  assertClientAnalyticsPolicy(params);
  try {
    observe(() => reporter.onQuoteRequest(getQuoteAnalyticsContext(params)));
    const {
      chainId, partner, inToken, inAmount, outToken, user, slippage,
      dexMinAmountOut = "-1", signal, apiUrl,
    } = params;
    signal?.throwIfAborted();
    const slippageBps = validateQuoteRequest({ chainId, partner, inToken, inAmount, outToken, user, slippage });
    const query = new URLSearchParams({ chainId: String(chainId), partner });
    const endpoint = getQuoteEndpoint(apiUrl);
    let response: Response;
    try {
      response = await fetch(`${endpoint}/quote?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          inToken,
          inAmount,
          outToken,
          user,
          slippage: slippageBps,
          outAmount: dexMinAmountOut,
        }),
        signal,
      });
    } catch (error) {
      // Caller cancellation remains cancellation, not a retryable venue failure.
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      throw new QuoteError(error instanceof Error ? error.message : "Unable to fetch swap quote", "network");
    }
    const data = await readQuoteResponse(response, signal);
    signal?.throwIfAborted();
    if (!response.ok || response.status === 204) {
      throw quoteResponseError(response, data);
    }
    const amounts = parseQuoteAmounts(data, response.status);
    const quote = Object.freeze({
      request: Object.freeze({ chainId, partner, inToken, inAmount, outToken, user, slippage, dexMinAmountOut }),
      receivedAt: Date.now(),
      ...amounts,
    });
    observe(() => reporter.onQuoteSuccess());
    return quote;
  } catch (error) {
    observe(() => reporter.onQuoteError(error));
    throw error;
  }
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
  if (!Number.isFinite(quote.receivedAt) || !Number.isFinite(now) ||
    !Number.isFinite(maxAgeMillis) || maxAgeMillis < 0) return false;
  const age = now - quote.receivedAt;
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMillis;
}

import { getApiEndpoint } from "./api-config";
import { MAX_UINT_256 } from "./evm-constants";
import { isQuoteAbortError, QuoteError } from "./quote-error";
import { getSlippageBps } from "./swap-amounts";
import type { SwapQuote, SwapQuoteParams } from "./quote";

const MAX_AMOUNT = BigInt(MAX_UINT_256);
const isAmount = (value: unknown): value is string =>
  typeof value === "string" && /^\d+$/.test(value) && BigInt(value) <= MAX_AMOUNT;
const isDecimal = (value: unknown): value is string =>
  typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value);
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

const positiveAmount = (value: unknown, field: string): bigint => {
  if (!isAmount(value) || BigInt(value) <= BigInt(0) || BigInt(value) > MAX_AMOUNT) {
    throw new QuoteError(`${field} must be a positive uint256 integer base-unit amount`, "invalid-request");
  }
  return BigInt(value);
};

interface QuoteResponsePayload {
  amountIn?: unknown;
  quoteMode?: unknown;
  requestedAmountOut?: unknown;
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

const validateQuoteRequest = (params: SwapQuoteParams): number => {
  const { chainId, inToken, outToken, user, inAmount, outAmount, slippage, dexMinAmountOut } = params;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new QuoteError("chainId must be a positive safe integer", "invalid-request");
  }
  for (const [field, address] of [["inToken", inToken], ["outToken", outToken], ["user", user]] as const) {
    if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
      throw new QuoteError(`Invalid ${field} address`, "invalid-request");
    }
  }
  if ((inAmount !== undefined) === (outAmount !== undefined)) {
    throw new QuoteError("Quote requests require exactly one of inAmount or outAmount", "invalid-request");
  }
  positiveAmount(outAmount !== undefined ? outAmount : inAmount, outAmount !== undefined ? "outAmount" : "inAmount");
  if (dexMinAmountOut !== undefined && dexMinAmountOut !== "-1" &&
      (!isAmount(dexMinAmountOut) || BigInt(dexMinAmountOut) > MAX_AMOUNT)) {
    throw new QuoteError(
      'dexMinAmountOut must be "-1" or a non-negative uint256 integer base-unit amount',
      "invalid-request",
    );
  }
  if (outAmount !== undefined && dexMinAmountOut !== undefined && dexMinAmountOut !== "-1") {
    throw new QuoteError("dexMinAmountOut is supported only for input quotes", "invalid-request");
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
    if (signal?.aborted || isQuoteAbortError(error)) throw error;
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
    BigInt(data.amountOut) <= BigInt(0) || BigInt(data.netAmountOut) <= BigInt(0) ||
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

const resolvedInputAmount = (data: QuoteResponsePayload, params: SwapQuoteParams, status: number): string => {
  const outputMode = params.outAmount !== undefined;
  if (data.quoteMode !== undefined && data.quoteMode !== (outputMode ? "exactOut" : "exactIn")) {
    throw new QuoteError("Quote mode does not match the requested amount", "invalid-response", status);
  }
  if (outputMode && data.requestedAmountOut !== undefined &&
      (!isAmount(data.requestedAmountOut) || BigInt(data.requestedAmountOut) !== BigInt(params.outAmount!))) {
    throw new QuoteError("Quote output target does not match the request", "invalid-response", status);
  }
  const input = data.amountIn;
  if (outputMode || input !== undefined) {
    if (!isAmount(input) || BigInt(input) <= BigInt(0)) {
      throw new QuoteError("Quote amountIn must be a positive uint256 integer", "invalid-response", status);
    }
    if (!outputMode && BigInt(input) !== BigInt(params.inAmount!)) {
      throw new QuoteError("Quote input amount does not match the request", "invalid-response", status);
    }
    return outputMode ? input : params.inAmount!;
  }
  return params.inAmount!;
};

export const fetchSwapQuote = async (params: SwapQuoteParams): Promise<SwapQuote> => {
  const {
    chainId, partner, inToken, inAmount, outAmount, outToken, user, slippage,
    dexMinAmountOut = "-1", signal, apiUrl,
  } = params;
  signal?.throwIfAborted();
  const slippageBps = validateQuoteRequest(params);
  const query = new URLSearchParams({ chainId: String(chainId), partner });
  const endpoint = getQuoteEndpoint(apiUrl);
  let response: Response;
  try {
    response = await fetch(`${endpoint}/quote?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        inToken,
        ...(outAmount !== undefined ? { outAmount } : { inAmount }),
        outToken,
        user,
        slippage: slippageBps,
      }),
      signal,
    });
  } catch (error) {
    // Caller cancellation remains cancellation, not a retryable venue failure.
    if (signal?.aborted || isQuoteAbortError(error)) throw error;
    throw new QuoteError(error instanceof Error ? error.message : "Unable to fetch swap quote", "network");
  }
  const data = await readQuoteResponse(response, signal);
  signal?.throwIfAborted();
  if (!response.ok || response.status === 204) {
    throw quoteResponseError(response, data);
  }
  const amounts = parseQuoteAmounts(data, response.status);
  const resolvedInput = resolvedInputAmount(data!, params, response.status);
  if (outAmount !== undefined && BigInt(amounts.minimumAmountOut) < BigInt(outAmount)) {
    throw new QuoteError("Quote minimum is below the requested output", "invalid-response", response.status);
  }
  if (dexMinAmountOut !== "-1" && BigInt(amounts.minimumAmountOut) < BigInt(dexMinAmountOut)) {
    throw new QuoteError("Quote minimum is below dexMinAmountOut", "no-quote", response.status);
  }
  return Object.freeze({
    request: Object.freeze({ chainId, partner, inToken, inAmount: resolvedInput, outToken, user, slippage, dexMinAmountOut }),
    ...(outAmount !== undefined ? { requestedOutAmount: outAmount } : {}),
    receivedAt: Date.now(),
    ...amounts,
  });
};


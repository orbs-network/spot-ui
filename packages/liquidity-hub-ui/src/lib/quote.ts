import type { Analytics } from "./analytics";
import type {
  Eip712Domain,
  Eip712Field,
  Quote,
  QuoteArgs,
  QuoteEip712,
  QuotePermitData,
} from "./types";
import {
  devLog,
  eqIgnoreCase,
  isAbortError,
  throwIfAborted,
  toError,
} from "./util";

const QUOTE_TIMEOUT = 10_000;
const REQUIRED_QUOTE_STRINGS = [
  "inToken",
  "outToken",
  "inAmount",
  "outAmount",
  "user",
  "qs",
  "partner",
  "exchange",
  "sessionId",
  "serializedOrder",
  "minAmountOut",
  "userMinOutAmountWithGas",
  "outAmountWsMinusGas",
  "outAmountWS",
] as const;
const REQUIRED_QUOTE_AMOUNTS = [
  "inAmount",
  "outAmount",
  "minAmountOut",
  "userMinOutAmountWithGas",
  "outAmountWsMinusGas",
  "outAmountWS",
] as const;

type QuoteResponse = Omit<Quote, "timestamp">;
type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAddress = (value: unknown): value is `0x${string}` =>
  typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value);

const getResponseError = (payload: unknown): string | undefined =>
  isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : undefined;

const isEip712Types = (
  value: unknown,
): value is Record<string, Eip712Field[]> =>
  isRecord(value) &&
  Object.values(value).every(
    (fields) =>
      Array.isArray(fields) &&
      fields.every(
        (field) =>
          isRecord(field) &&
          typeof field.name === "string" &&
          typeof field.type === "string",
      ),
  );

const isEip712Domain = (value: unknown): value is Eip712Domain => {
  if (!isRecord(value)) return false;

  return (
    (value.name === undefined || typeof value.name === "string") &&
    (value.version === undefined || typeof value.version === "string") &&
    (value.chainId === undefined ||
      (Number.isSafeInteger(value.chainId) && Number(value.chainId) > 0)) &&
    (value.verifyingContract === undefined ||
      isAddress(value.verifyingContract)) &&
    (value.salt === undefined ||
      (typeof value.salt === "string" && /^0x[0-9a-f]+$/i.test(value.salt)))
  );
};

const isPermitData = (value: unknown): value is QuotePermitData => {
  if (!isRecord(value)) return false;

  return (
    isEip712Domain(value.domain) &&
    isEip712Types(value.types) &&
    isRecord(value.values) &&
    (value.primaryType === undefined || typeof value.primaryType === "string")
  );
};

const isEip712 = (value: unknown): value is QuoteEip712 => {
  if (!isRecord(value)) return false;

  return (
    isEip712Domain(value.domain) &&
    isEip712Types(value.types) &&
    typeof value.primaryType === "string" &&
    value.primaryType.length > 0 &&
    value.primaryType in value.types &&
    isRecord(value.message)
  );
};

function assertQuoteResponse(
  payload: unknown,
): asserts payload is QuoteResponse {
  if (!isRecord(payload)) {
    throw new Error("Liquidity Hub returned an invalid quote response");
  }

  for (const field of REQUIRED_QUOTE_STRINGS) {
    if (typeof payload[field] !== "string") {
      throw new Error(`Liquidity Hub quote is missing ${field}`);
    }
  }
  for (const field of REQUIRED_QUOTE_AMOUNTS) {
    if (!/^\d+$/.test(payload[field] as string)) {
      throw new Error(`Liquidity Hub quote has invalid ${field}`);
    }
  }
  if (
    payload.gasAmountOut !== undefined &&
    (typeof payload.gasAmountOut !== "string" ||
      !/^\d+$/.test(payload.gasAmountOut))
  ) {
    throw new Error("Liquidity Hub quote has invalid gasAmountOut");
  }
  if (
    typeof payload.slippage !== "number" ||
    !Number.isFinite(payload.slippage)
  ) {
    throw new Error("Liquidity Hub quote is missing slippage");
  }
  if (!isPermitData(payload.permitData)) {
    throw new Error("Liquidity Hub quote has invalid permitData");
  }
  if (!isEip712(payload.eip712)) {
    throw new Error("Liquidity Hub quote has invalid eip712");
  }
  if (!isAddress(payload.user)) {
    throw new Error("Liquidity Hub quote has invalid user");
  }
}

const assertQuoteMatchesRequest = (
  quote: QuoteResponse,
  args: QuoteArgs,
  partner: string,
): void => {
  if (
    !eqIgnoreCase(quote.inToken, args.fromToken) ||
    !eqIgnoreCase(quote.outToken, args.toToken) ||
    quote.inAmount !== args.inAmount ||
    !eqIgnoreCase(quote.partner, partner) ||
    (args.account !== undefined && !eqIgnoreCase(quote.user, args.account))
  ) {
    throw new Error("Liquidity Hub quote does not match the request");
  }
};

const assertQuoteArgs = (args: QuoteArgs): void => {
  if (!args.fromToken.trim() || !args.toToken.trim()) {
    throw new Error("Liquidity Hub quote token addresses are required");
  }
  if (!/^\d+$/.test(args.inAmount) || BigInt(args.inAmount) <= 0n) {
    throw new Error("Liquidity Hub inAmount must be a positive integer string");
  }
  if (
    args.dexMinAmountOut !== undefined &&
    args.dexMinAmountOut !== "-1" &&
    !/^\d+$/.test(args.dexMinAmountOut)
  ) {
    throw new Error(
      "Liquidity Hub dexMinAmountOut must be a non-negative integer string",
    );
  }
  if (!Number.isFinite(args.slippage) || args.slippage < 0) {
    throw new Error("Liquidity Hub slippage must be a non-negative number");
  }
  if (
    args.timeout !== undefined &&
    (!Number.isFinite(args.timeout) || args.timeout <= 0)
  ) {
    throw new Error("Liquidity Hub quote timeout must be a positive number");
  }
};

const safeEncodeLocation = (): string => {
  try {
    if (typeof window !== "undefined") {
      return encodeURIComponent(window.location.hash || window.location.search);
    }
  } catch {}
  return "";
};

export const fetchQuote = async (
  args: QuoteArgs,
  partner: string,
  chainId: number,
  apiUrl: string,
  analytics: Analytics,
): Promise<Quote> => {
  assertQuoteArgs(args);
  throwIfAborted(args.signal);

  const requestStage = analytics.onQuoteRequest({
    srcTokenAddress: args.fromToken,
    dstTokenAddress: args.toToken,
    slippage: args.slippage,
    dexMinAmountOut: args.dexMinAmountOut ?? "",
    inAmount: args.inAmount,
    account: args.account ?? "",
    inAmountUsd: args.inAmountUsd,
    disabled: args.disabled,
  });
  const sessionId = analytics.liquidityHubId || undefined;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(args.signal?.reason);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, args.timeout ?? QUOTE_TIMEOUT);

  args.signal?.addEventListener("abort", abortFromCaller, { once: true });
  devLog("quote start", { args });

  try {
    const response = await fetch(`${apiUrl}/quote?chainId=${chainId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        inToken: args.fromToken,
        outToken: args.toToken,
        inAmount: args.inAmount,
        outAmount: args.dexMinAmountOut || "-1",
        user: args.account,
        slippage: args.slippage,
        qs: safeEncodeLocation(),
        partner,
        sessionId,
      }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw new Error(
        getResponseError(payload) ??
          `Liquidity Hub quote request failed (${response.status})`,
      );
    }
    const responseError = getResponseError(payload);
    if (responseError) throw new Error(responseError);

    assertQuoteResponse(payload);
    assertQuoteMatchesRequest(payload, args, partner);
    const quote: Quote = { ...payload, timestamp: Date.now() };
    analytics.onQuoteSuccess(quote, requestStage);
    devLog("quote success", { quote });
    devLog("price compare", {
      liquidityHubMinimum: quote.userMinOutAmountWithGas,
      dexMinimum: args.dexMinAmountOut,
    });
    return quote;
  } catch (error) {
    const normalizedError = timedOut
      ? Object.assign(new Error("Liquidity Hub quote request timed out"), {
          name: "TimeoutError",
        })
      : toError(error, "Liquidity Hub quote request failed");
    const wasCancelled = args.signal?.aborted || isAbortError(normalizedError);

    if (!wasCancelled) {
      analytics.onQuoteFailed(normalizedError.message, requestStage);
    }
    devLog("quote error", { error: normalizedError });
    throw normalizedError;
  } finally {
    clearTimeout(timeout);
    args.signal?.removeEventListener("abort", abortFromCaller);
  }
};

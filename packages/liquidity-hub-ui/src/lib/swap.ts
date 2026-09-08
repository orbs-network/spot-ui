import type { Analytics } from "./analytics";
import type { DexRouterData, Quote } from "./types";
import { delay, devLog, isAbortError, toError } from "./util";

const SWAP_STATUS_ATTEMPTS = 30;
const SWAP_STATUS_INTERVAL = 2_000;
const SWAP_TIMEOUT = SWAP_STATUS_ATTEMPTS * SWAP_STATUS_INTERVAL;
const JSON_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
} as const;

type JsonRecord = Record<string, unknown>;

interface SubmitSwapArgs {
  signature: string;
  quote: Quote;
  chainId: number;
  apiUrl: string;
  dexRouterData?: DexRouterData;
  signal: AbortSignal;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getPayloadError = (payload: unknown): string | undefined =>
  isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : undefined;

const getHttpError = (
  response: Response,
  payload: unknown,
  operation: string,
): Error =>
  new Error(
    getPayloadError(payload) ??
      `Liquidity Hub ${operation} request failed (${response.status})`,
  );

const readPollingResponse = async (
  url: string,
  body: object,
  signal: AbortSignal | undefined,
  operation: string,
): Promise<JsonRecord | undefined> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    devLog(`${operation} network request failed, retrying`, { error });
    return undefined;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    devLog(`${operation} returned invalid JSON, retrying`, { error });
    return undefined;
  }

  if (
    response.status === 404 ||
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500
  ) {
    devLog(`${operation} is not ready, retrying`, {
      status: response.status,
    });
    return undefined;
  }
  if (!response.ok) throw getHttpError(response, payload, operation);
  const payloadError = getPayloadError(payload);
  if (payloadError) throw new Error(payloadError);
  if (!isRecord(payload)) {
    devLog(`${operation} returned an invalid response, retrying`, { payload });
    return undefined;
  }
  return payload;
};

const submitSwap = async ({
  signature,
  quote,
  chainId,
  apiUrl,
  dexRouterData,
  signal,
}: SubmitSwapArgs): Promise<string | undefined> => {
  const { timestamp: _timestamp, error: _quoteError, ...quotePayload } = quote;
  const response = await fetch(`${apiUrl}/swap-async?chainId=${chainId}`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      ...quotePayload,
      signature,
      dexTx: dexRouterData,
      sessionId: quote.sessionId,
    }),
    signal,
  });
  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) throw getHttpError(response, payload, "swap");
  const payloadError = getPayloadError(payload);
  if (payloadError) throw new Error(payloadError);
  if (!isRecord(payload)) {
    throw new Error("Liquidity Hub returned an invalid swap response");
  }
  if (payload.txHash === undefined) return undefined;
  if (typeof payload.txHash !== "string" || !payload.txHash) {
    throw new Error("Liquidity Hub returned an invalid transaction hash");
  }
  return payload.txHash;
};

const waitForSwap = async ({
  chainId,
  user,
  apiUrl,
  sessionId,
  signal,
}: {
  chainId: number;
  user: string;
  apiUrl: string;
  sessionId: string;
  signal: AbortSignal;
}): Promise<string> => {
  for (let attempt = 0; attempt < SWAP_STATUS_ATTEMPTS; attempt++) {
    // Give the async submission endpoint time to register the session. A hash
    // returned directly by submission still wins immediately.
    await delay(SWAP_STATUS_INTERVAL, signal);

    const result = await readPollingResponse(
      `${apiUrl}/swap/status/${sessionId}?chainId=${chainId}`,
      { user },
      signal,
      "swap status",
    );
    if (!result) continue;
    if (typeof result.txHash === "string" && result.txHash) {
      return result.txHash;
    }
  }
  throw new Error("Liquidity Hub swap timed out");
};

export const swap = async (
  quote: Quote,
  signature: string,
  chainId: number,
  apiUrl: string,
  analytics: Analytics,
  dexRouterData?: DexRouterData,
): Promise<string> => {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SWAP_TIMEOUT);

  devLog("swap start", { dexRouterData, quote });
  analytics.onSwapRequest(quote, dexRouterData);

  const submission = submitSwap({
    signature,
    quote,
    chainId,
    apiUrl,
    dexRouterData,
    signal: controller.signal,
  });
  const polledHash = waitForSwap({
    sessionId: quote.sessionId,
    apiUrl,
    user: quote.user,
    chainId,
    signal: controller.signal,
  });
  const submittedHash = submission.then((txHash) => txHash ?? polledHash);

  try {
    const txHash = await Promise.race([submittedHash, polledHash]);
    analytics.onSwapTxHash(txHash);
    devLog("swap tx hash", { txHash });
    return txHash;
  } catch (error) {
    const normalizedError = timedOut
      ? new Error("Liquidity Hub swap timed out")
      : toError(error, "Liquidity Hub swap failed");
    devLog("swap failed", { error: normalizedError });
    analytics.onSwapFailed(normalizedError.message);
    throw normalizedError;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
};

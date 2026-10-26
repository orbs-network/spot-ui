import {
  getMinimumOutputAmount, isSwapSupported, waitForOrder,
  type PreparedSwap,
  type SpotClient, type SubmittedSwap, type SwapQuote, type SwapTradeType,
} from "@orbs-network/spot-ui";

export interface SpotRoute {
  quote: SwapQuote;
  minimumOutputAmountRaw: string;
  nativeInput: boolean;
}

/** One candidate in the DEX's existing quote competition. No SpotProvider needed. */
export async function quoteSpotRoute(params: {
  client: SpotClient;
  account: string;
  inToken: string; // Already normalized to the wrapped ERC-20 for native input.
  outToken: string;
  inAmount: string;
  slippage: number; // Percent: 0.5 = 0.5%; convert host bps to percent once here.
  nativeInput: boolean;
  recipient?: string;
  tradeType?: SwapTradeType;
  /** For this exact input/chain/pair; host retains any gas/fee ranking policy. */
  dexMinimumOutputRaw?: string;
  signal?: AbortSignal;
}): Promise<SpotRoute | undefined> {
  if (!isSwapSupported({ ...params, swapperAddress: params.account })) return undefined;
  const quote = await params.client.getQuote({
    inToken: params.inToken, outToken: params.outToken, inAmount: params.inAmount,
    user: params.account, slippage: params.slippage,
    dexMinAmountOut: params.dexMinimumOutputRaw ?? "-1", signal: params.signal,
  });
  const minimumOutputAmountRaw = getMinimumOutputAmount(quote.netAmountOut, params.slippage);
  if (params.dexMinimumOutputRaw !== undefined && BigInt(minimumOutputAmountRaw) <= BigInt(params.dexMinimumOutputRaw)) return undefined;
  return { quote, minimumOutputAmountRaw, nativeInput: params.nativeInput };
}

/**
 * Call after the DEX confirms wrapping/approval to client.spenderAddress.
 * The DEX owns its execution lock and live account/chain/balance checks.
 * Prepare immediately before signing; a stale quote requires a new review.
 */
export function prepareSpotRoute(params: {
  client: SpotClient;
  route: SpotRoute;
  account: string;
}): PreparedSwap {
  return params.client.prepareSwap({
    quote: params.route.quote,
    minimumOutputAmountRaw: params.route.minimumOutputAmountRaw,
    swapperAddress: params.account,
    maxQuoteAgeMillis: 60_000, // Example local policy, not a server expiry claim.
  });
}

/**
 * The DEX signs prepared.signingRequest with its existing wallet code, then
 * rechecks the live context before calling this submission-only adapter.
 * Forward the original signature; no wallet callbacks or provider are needed.
 */
export async function submitSignedSpotRoute(params: {
  client: SpotClient;
  prepared: PreparedSwap;
  signature: `0x${string}`;
}): Promise<SubmittedSwap> {
  const order = await params.client.submitOrder(params.prepared.order, params.signature);
  return {
    type: "intent", status: "submitted", orderId: order.id, order,
    deadlineMillis: params.prepared.values.deadlineMillis,
  };
}

/** Keep this at app/store scope if the confirmation modal unmounts after submission. */
export function trackSpotRoute(submitted: SubmittedSwap, signal?: AbortSignal) {
  return waitForOrder({ order: submitted.order, signal });
}

// The DEX keeps its own selector, wallet steps, progress UI, and execution lock.
// Native input: wrap route.quote.request.inAmount when route.nativeInput is true.
// Approve the quote's ERC-20 input token/amount to client.spenderAddress and verify
// confirmed allowance before prepareSpotRoute. Never reprepare after signing.
// Check the active abort signal and account/chain before each wallet step and POST.
// Once the POST starts, preserve any accepted ID even if the form unmounts.
// Pause/cancel quote requests through wallet execution and any active swap loading UI.
// Treat QuoteError.kind/status/code as venue evidence; do not turn every error into "no offer".
// After submission, reconcile this intent before executing a DEX fallback.

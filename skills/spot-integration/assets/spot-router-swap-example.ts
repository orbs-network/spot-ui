import {
  isSwapSupported,
  type PreparedSwap,
  type SpotClient, type CompletedSwap, type Order, type SwapQuote, type SwapTradeType,
} from "@orbs-network/spot-ui";

export interface SpotRoute {
  quote: SwapQuote;
}

/** One candidate in the DEX's existing quote competition. No SpotProvider needed. */
export async function quoteSpotRoute(params: {
  client: SpotClient;
  account: string;
  inToken: string; // Protocol ERC-20 input; use the wrapped address for a native selection.
  outToken: string;
  inAmount: string;
  slippage: number; // Percent: 0.5 = 0.5%; convert host bps to percent once here.
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
  const minimumOutputAmountRaw = quote.minimumAmountOut;
  if (params.dexMinimumOutputRaw !== undefined && BigInt(minimumOutputAmountRaw) <= BigInt(params.dexMinimumOutputRaw)) return undefined;
  return { quote };
}

/**
 * Call after host wrapping, refreshed wrapped balance, and confirmed approval, immediately before signing.
 * Reuses quotes up to 20 seconds old or refreshes the exact request and checks its minimum.
 * A lower refreshed minimum throws QUOTE_MINIMUM_DECREASED. The reviewed minimum stays signed.
 * Both paths prepare fresh signing timestamps and nonce; no separate age check is needed.
 * The DEX owns its execution lock and live account/chain/balance checks.
 */
export async function prepareSpotRoute(params: {
  client: SpotClient;
  route: SpotRoute;
  account: string;
  signal?: AbortSignal;
  /** Optional finite, non-negative quote reuse window; 0 forces a refresh. */
  maxQuoteAgeMillis?: number;
}): Promise<PreparedSwap> {
  return params.client.prepareSwap({
    quote: params.route.quote,
    account: params.account,
    signal: params.signal,
    maxQuoteAgeMillis: params.maxQuoteAgeMillis,
  });
}

/**
 * The DEX signs prepared.signingRequest with its existing wallet code, then
 * rechecks the live context before submitting and waiting for the swap fill.
 * Forward the original signature; no wallet callbacks or provider are needed.
 * If tracking fails, retain OrderSettlementError.order and orderId for read-only recovery.
 */
export async function submitSignedSpotRoute(params: {
  client: SpotClient;
  prepared: PreparedSwap;
  signature: `0x${string}`;
  signal?: AbortSignal;
}): Promise<CompletedSwap> {
  const order = await params.client.submitSignedSwap(params.prepared, params.signature, {
    signal: params.signal,
  });
  return {
    type: "intent", status: "completed", orderId: order.id, order,
    deadlineMillis: order.deadline,
  };
}

/** Resume an accepted order using read-only lookups; no signature or resubmission. */
export function resumeSpotRoute(client: SpotClient, order: Order, signal?: AbortSignal) {
  return client.executeOrder({ order, signal });
}

// The DEX keeps its own selector, wallet steps, progress UI, and execution lock.
// Quote the wrapped ERC-20 address for native input. After user review, the
// manual host flow confirms wrapping before preparation and signing.
// Approve the quote's ERC-20 input token/amount to client.spenderAddress and verify
// confirmed allowance before prepareSpotRoute. Never reprepare after signing.
// Check the active abort signal and account/chain before each wallet step and POST.
// Once the POST starts, preserve any accepted ID even if the form unmounts.
// Pause/cancel quote requests through wallet execution and any active swap loading UI.
// Treat QuoteError.kind/status/code as venue evidence; do not turn every error into "no offer".
// After submission, reconcile this intent before executing a DEX fallback.

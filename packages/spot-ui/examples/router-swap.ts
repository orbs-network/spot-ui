import {
  isSwapSupported,
  type Address, type Eip712TypedData, type Hex,
  type PreparedSwap, type SpotClient, type Order, type SwapQuote, type SwapTradeType,
} from "@orbs-network/spot-ui";

export interface SpotRoute { quote: SwapQuote }

/** One candidate in the DEX's route competition; no provider or wallet calls. */
export async function quoteSpotRoute(params: {
  client: SpotClient;
  account: string;
  inToken: string; // Wrapped ERC-20 address for a native selection.
  outToken: string;
  inAmount: string;
  slippage: number; // Percent: 0.5 = 0.5%.
  recipient?: string;
  tradeType?: SwapTradeType;
  dexMinimumOutputRaw?: string;
  signal?: AbortSignal;
}): Promise<SpotRoute | undefined> {
  if (!isSwapSupported({ ...params, swapperAddress: params.account })) return undefined;
  const quote = await params.client.getQuote({
    inToken: params.inToken, outToken: params.outToken, inAmount: params.inAmount,
    user: params.account, slippage: params.slippage,
    dexMinAmountOut: params.dexMinimumOutputRaw, signal: params.signal,
  });
  if (params.dexMinimumOutputRaw !== undefined &&
    BigInt(quote.minimumAmountOut) <= BigInt(params.dexMinimumOutputRaw)) return undefined;
  return { quote };
}

/** Example DEX-owned services, not an SDK wallet-adapter contract. */
export interface DexRouteWallet {
  isNativeInput: boolean;
  getAllowance(tokenAddress: string, spenderAddress: Address): Promise<bigint>;
  /** Resolve only after a successful receipt. */
  wrapNativeToken(amountRaw: string): Promise<Hex>;
  /** Resolve only after a successful receipt; this example approves the exact amount. */
  approveToken(tokenAddress: string, spenderAddress: Address, amountRaw: string): Promise<Hex>;
  signTypedData(params: Eip712TypedData & { account: Address }): Promise<Hex>;
}

/** Host-owned attempt state survives modal closure and uncertain POST responses. */
export interface SpotRouteAttempt {
  wrapTxHash?: Hex;
  approvalTxHash?: Hex;
  prepared?: PreparedSwap;
  signature?: Hex;
  order?: Order;
}

/**
 * Call once for the captured review under the DEX's execution lock. The DEX owns
 * live account/chain, gas/balance checks, receipt confirmations, progress, and retries.
 * Returns acceptance; the DEX tracks fills through client.getOrder afterwards.
 */
export async function submitSpotRoute(params: {
  client: SpotClient;
  route: SpotRoute;
  account: Address;
  wallet: DexRouteWallet;
  attempt: SpotRouteAttempt;
  signal?: AbortSignal;
}): Promise<Order> {
  const { client, route, account, wallet, attempt, signal } = params;
  const quote = structuredClone(route.quote);
  const amount = BigInt(quote.request.inAmount);
  const token = quote.request.inToken;
  const spender = client.spenderAddress;
  const check = () => signal?.throwIfAborted();
  check();
  let allowance = await wallet.getAllowance(token, spender);
  check();
  if (wallet.isNativeInput) {
    attempt.wrapTxHash = await wallet.wrapNativeToken(quote.request.inAmount);
    check();
  }
  for (let attemptIndex = 0; allowance < amount && attemptIndex < 2; attemptIndex += 1) {
    check();
    attempt.approvalTxHash = await wallet.approveToken(token, spender, quote.request.inAmount);
    check();
    allowance = await wallet.getAllowance(token, spender);
    check();
  }
  if (allowance < amount) throw new Error("Confirmed approval is still insufficient");

  attempt.prepared = await client.prepareSwap({ quote, account, signal });
  check();
  // Publish attempt.prepared.quote to the review before the signature prompt.
  const { signerAddress, typedData } = attempt.prepared.signingRequest;
  attempt.signature = await wallet.signTypedData({ ...typedData, account: signerAddress });
  check();
  attempt.order = await client.submitSwap(attempt.prepared.order, attempt.signature, { signal });
  return attempt.order;
}

// Preserve attempt.prepared/signature if acceptance is uncertain. Reconcile the
// original signed identity before another Spot intent or DEX fallback. Use the
// known accepted ID with client.getOrder({ orderId: attempt.order.id, signal });
// the host owns a single cancellable status poller and completion UI.

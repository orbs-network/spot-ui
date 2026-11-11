import {
  isSwapSupported,
  type PreparedSwap,
  type SpotClient, type Order, type SwapQuote, type SwapTradeType,
  type OrderWalletInteractions, type OrderExecutionUpdate, type SwapExecution,
} from "@orbs-network/spot-ui";

export interface SpotRoute {
  quote: SwapQuote;
}

/** One candidate in the DEX's existing quote competition. No AdvancedOrdersProvider needed. */
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
    dexMinAmountOut: params.dexMinimumOutputRaw, signal: params.signal,
  });
  const minimumOutputAmountRaw = quote.minimumAmountOut;
  if (params.dexMinimumOutputRaw !== undefined && BigInt(minimumOutputAmountRaw) <= BigInt(params.dexMinimumOutputRaw)) return undefined;
  return { quote };
}

/**
 * Capture one reviewed route and its host wallet adapter; construction does no wallet work.
 * Wallet shouldApprove checks request.amount; approveToken can follow the suggested
 * request.approvalAmount or choose an exact/host cap without mutating the SDK request.
 */
export function createSpotRouteExecution(params: {
  client: SpotClient;
  route: SpotRoute;
  account: string;
  walletInteractions: OrderWalletInteractions;
  signal?: AbortSignal;
}): SwapExecution {
  return params.client.createSwapExecution({
    quote: params.route.quote,
    account: params.account,
    walletInteractions: params.walletInteractions,
    signal: params.signal,
  });
}

/** Read-only UI preview. Actual wrap/approve steps check the decisions again. */
export async function previewSpotRouteSteps(execution: SwapExecution): Promise<{
  wrapRequired: boolean;
  approvalRequired: boolean;
}> {
  const wrapRequired = await execution.shouldWrap();
  const approvalRequired = await execution.shouldApprove();
  return { wrapRequired, approvalRequired };
}

/** Default orchestration: returns the completed Order after the swap fills. */
export function runSpotRoute(
  execution: SwapExecution,
  onProgress?: (update: OrderExecutionUpdate<PreparedSwap>) => void,
): Promise<Order> {
  return execution.run({ onProgress });
}

/** The same session, with the host controlling when each step begins. */
export async function runSpotRouteSteps(execution: SwapExecution): Promise<Order> {
  if (await execution.shouldWrap()) await execution.wrap();
  if (await execution.shouldApprove()) await execution.approve();
  await execution.sign(); // Prepares late after prerequisite steps, then stores the original signature.
  await execution.submit(); // Uses the stored payload/signature once; execution.order is now accepted.
  return execution.waitForCompletion();
}

// The DEX keeps its selector, host wallet callbacks, progress UI, and execution lock.
// Quote the wrapped ERC-20 address for native input. Validate the live account,
// chain, balance, and minimum-trade policy before each wallet step and submission.
// The session stores the reviewed request and exact prepared payload/signature.
// Wallet signing callbacks return their original bytes unchanged.
// Keep the session outside transient modals; cancel() stops later steps/tracking
// but cannot undo a transaction or cancel an accepted order.
// Preserve execution.order or OrderSettlementError.order/orderId if tracking stops.
// Pause obsolete quote requests during execution and reconcile uncertain acceptance
// before starting another Spot intent or a DEX fallback.

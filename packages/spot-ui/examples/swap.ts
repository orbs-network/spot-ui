// SDK-orchestrated swap flow with a quote-based UI preview.
// Existing DEX wallet flows should start with router-swap.ts instead.
import {
  type OrderWalletInteractions,
  type OrderExecutionUpdate,
  type PreparedSwap,
  type Order,
  type Address,
  type SpotClient,
  type SwapQuote,
  type Token,
} from "@orbs-network/spot-ui";

/**
 * Supply decisions and confirmed writes bound to the reviewed account/chain.
 * shouldApprove compares live allowance with request.amount (the exact input).
 * approveToken may use request.approvalAmount (suggested maximum uint256),
 * request.amount for an exact cap, or host policy, without mutating the request.
 */
export type SwapWallet = OrderWalletInteractions;

export interface SwapPreview {
  client: SpotClient;
  account: Address;
  inputToken: Token;
  outputToken: Token;
  quote: SwapQuote;
}

/** Quote for review using the host's token metadata; this does not open the wallet. */
export async function createSwapPreview(params: {
  client: SpotClient;
  account: Address;
  /** Protocol ERC-20 input; use the configured wrapped token for a native selection. */
  inputToken: Token;
  outputToken: Token;
  /** Integer base units, converted with the host's wallet/token library. */
  inputAmountRaw: string;
  /** Percentage: 0.5 means 0.5%. The signed swap-order field stays at 500 bps. */
  slippage?: number;
  signal?: AbortSignal;
}): Promise<SwapPreview> {
  const { client, account, inputToken, outputToken, slippage = 0.5 } = params;
  if (!Number.isFinite(slippage) || slippage < 0 || slippage >= 100) {
    throw new Error("UI slippage must be at least 0 and less than 100%");
  }
  const { inputAmountRaw } = params;
  if (!/^\d+$/.test(inputAmountRaw) || BigInt(inputAmountRaw) <= 0n) {
    throw new Error("Enter a positive input amount");
  }
  const quote = await client.getQuote({
    inToken: inputToken.address,
    outToken: outputToken.address,
    inAmount: inputAmountRaw,
    user: account,
    slippage,
    signal: params.signal,
  });
  // Display quote.request.inAmount, quote.netAmountOut, and quote.minimumAmountOut
  // using the host's formatter and these tokens' decimals. Keep the minimum unchanged.
  return { client, account, inputToken, outputToken, quote };
}

/** Call after review and host balance/minimum-trade checks. Resolves after a confirmed fill. */
export async function submitReviewedSwap(
  preview: SwapPreview,
  wallet: SwapWallet,
  onProgress?: (update: OrderExecutionUpdate<PreparedSwap>) => void,
): Promise<Order> {
  const { client, account, quote, inputToken, outputToken } = preview;
  if (quote.request.inToken.toLowerCase() !== inputToken.address.toLowerCase() ||
    quote.request.outToken.toLowerCase() !== outputToken.address.toLowerCase()) {
    throw new Error("Swap quote does not match the reviewed token pair");
  }
  const execution = client.createSwapExecution({
    quote, account, walletInteractions: wallet,
  });
  return execution.run({ onProgress });
}

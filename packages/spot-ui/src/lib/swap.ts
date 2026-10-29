import { executeOrder, type OrderExecutionUpdate, type OrderWalletInteractions } from "./execute-order";
import type { ApprovalRequest, OrderSigningRequest, SpotClient } from "./client";
import type { SwapQuote } from "./quote";
import type { Order, Partners, RePermitOrder } from "./types";
import { eqIgnoreCase, isNativeAddress } from "./utils";
import { SpotError } from "./errors";
import { getSlippageBps } from "./swap-amounts";

/** Supported routing features: exact input with the signer receiving the output. */
export const SWAP_CAPABILITIES = Object.freeze({ exactInput: true, exactOutput: false, customRecipient: false } as const);
/** Trade direction requested by a router. Spot currently supports only `"exact-input"`. */
export type SwapTradeType = "exact-input" | "exact-output";

/** Reviewed quote and connected account shared by swap validation and {@link submitSwap}. */
export interface PrepareSwapParams {
  /** Quote for the same client chain and partner; its request supplies the pair, input, and slippage. */
  quote: SwapQuote;
  /** Connected account that signs the order and receives the output, independent of the quote's preview user. */
  userAddress: string;
}

/** Locally prepared signing payload and approval requirements; no order has been submitted. */
export interface PreparedSwap {
  /** Protocol order to submit with its original wallet signature. */
  order: RePermitOrder;
  /** EIP-712 typed data and signer identity for the wallet adapter. */
  signingRequest: OrderSigningRequest;
  /** ERC-20 token, exact raw input amount, and spender requiring allowance. */
  approvalRequest: ApprovalRequest;
  /** Frozen quote snapshot used to prepare this order. */
  quote: SwapQuote;
  /** Raw input/output amounts and Unix preparation/deadline timestamps in milliseconds. */
  values: { inputAmount: string; minimumOutputAmountRaw: string; currentTimeMillis: number; deadlineMillis: number };
}

/**
 * Checks whether a router request uses Spot's supported trade direction and recipient.
 * Token, quote, balance, and amount validation happens separately during preparation.
 *
 * @returns True for exact input when the recipient is omitted or matches the signer.
 */
export function isSwapSupported({ tradeType = "exact-input", swapperAddress, recipient }: {
  tradeType?: SwapTradeType; swapperAddress: string; recipient?: string;
}): boolean {
  return tradeType === "exact-input" && (!recipient || eqIgnoreCase(recipient, swapperAddress));
}

/**
 * Validates a quote's chain, partner, tokens, and amounts, plus the connected signer.
 * The host remains responsible for balance, USD-value, and minimum-trade product checks.
 *
 * @throws If the request cannot be prepared as an exact-input Spot swap.
 */
export function validateSwap(params: PrepareSwapParams, chainId: number, partner: Partners): void {
  if ("deadlineMillis" in params) {
    throw new SpotError("INVALID_ARGUMENT", "Swap expiration is fixed at 3 minutes; remove deadlineMillis");
  }
  if (["minimumOutputAmountRaw", "swapperAddress", "recipient", "tradeType"].some(field => field in params)) {
    throw new SpotError("INVALID_ARGUMENT", "Swap preparation uses the quote's minimumAmountOut and userAddress as the signer. Remove minimumOutputAmountRaw, swapperAddress, recipient, and tradeType; use isSwapSupported before quoting.");
  }
  const { quote, userAddress } = params;
  if (!quote?.request || quote.request.chainId !== chainId || quote.request.partner !== partner) {
    throw new SpotError("QUOTE_CONTEXT_MISMATCH", "Swap quote does not match the client chain or partner");
  }
  for (const address of [quote.request.inToken, quote.request.outToken, userAddress]) {
    if (typeof address !== "string" || !/^0x[0-9a-f]{40}$/i.test(address)) throw new SpotError("INVALID_ARGUMENT", "Invalid swap token or signer address");
  }
  if (isNativeAddress(quote.request.inToken) || isNativeAddress(userAddress)) {
    throw new SpotError("UNSUPPORTED_SWAP", "Swap input must be the host's wrapped token and the signer must be nonzero");
  }
  if (eqIgnoreCase(quote.request.inToken, quote.request.outToken)) {
    throw new SpotError("UNSUPPORTED_SWAP", "Swap input and output tokens must be different");
  }
  for (const amount of [quote.request.inAmount, quote.netAmountOut, quote.minimumAmountOut]) {
    if (typeof amount !== "string" || !/^\d+$/.test(amount) || BigInt(amount) <= BigInt(0)) throw new SpotError("INVALID_AMOUNT", "Swap amounts must be positive integer base-unit amounts");
  }
  if (BigInt(quote.minimumAmountOut) > BigInt(quote.netAmountOut)) {
    throw new SpotError("INVALID_QUOTE", "Swap minimum exceeds the net quote");
  }
  getSlippageBps(quote.request.slippage);
}

/** Reviewed swap inputs plus the host's connected wallet adapter. */
export interface SubmitSwapParams extends PrepareSwapParams {
  /** Reused client for the quote's partner and chain. */
  client: SpotClient;
  /** Wallet operations that confirm wrapping/approval receipts before resolving. */
  walletInteractions: OrderWalletInteractions;
  /** Quote input remains the wrapped ERC-20 address; host opts into native wrapping. */
  nativeInput?: boolean;
  /** Reuse only a successful wrap for this exact account, chain, token, and amount. */
  completedWrapTxHash?: string;
  /** Stops subsequent steps. Completed wallet transactions or accepted orders remain valid. */
  signal?: AbortSignal;
  /** Throw if the connected account, chain, or reviewed request has changed. */
  validateContext?: () => void;
  /** Optional wallet-step progress observer; observer errors do not interrupt execution. */
  onUpdate?: (update: OrderExecutionUpdate<PreparedSwap>) => void;
}
/** Accepted swap intent. Use `waitForOrder({ order })` to confirm completion. */
export interface SubmittedSwap {
  type: "intent";
  status: "submitted";
  /** Full signed order ID, also available as `order.id`. */
  orderId: string;
  /** Accepted order snapshot suitable for `waitForOrder` or `watchOrder`. */
  order: Order;
  /** Accepted order expiration as Unix milliseconds, including protocol rounding to seconds; equals `order.deadline`. */
  deadlineMillis: number;
  /** Confirmed native wrapping transaction, when wrapping was required or reused. */
  wrapTxHash?: string;
  /** Confirmed ERC-20 approval transaction, when additional allowance was required. */
  approvalTxHash?: string;
}

/**
 * Submits a reviewed exact-input swap through the host's wallet adapter.
 * Checks allowance, wraps native input when requested, approves when needed, then
 * prepares fresh signing data, signs, and submits the order once.
 *
 * @param params - Reviewed quote, connected account, reused client, and wallet adapter.
 * @returns An accepted intent. Await `waitForOrder({ order: result.order })` for a completed fill.
 * @throws If validation, a wallet operation, signing, or submission fails.
 * Aborting stops later steps; it does not cancel transactions or an accepted order.
 * @example
 * const result = await submitSwap({
 *   client, quote, userAddress: account, walletInteractions,
 * });
 * const completed = await waitForOrder({ order: result.order });
 */
export async function submitSwap(params: SubmitSwapParams): Promise<SubmittedSwap> {
  const { client, walletInteractions, onUpdate, signal, nativeInput, completedWrapTxHash, validateContext } = params;
  validateSwap(params, client.chainId, client.partner);
  // Snapshot the reviewed quote and execution account before the first wallet await.
  const input: PrepareSwapParams = {
    quote: Object.freeze({ ...params.quote, request: Object.freeze({ ...params.quote.request }) }),
    userAddress: params.userAddress,
  };
  const result = await executeOrder({
    client, account: input.userAddress, inputTokenAddress: input.quote.request.inToken,
    inputAmountRaw: input.quote.request.inAmount, nativeInput, completedWrapTxHash,
    walletInteractions, signal, onUpdate, validateContext,
    prepareOrder: async () => {
      const fresh = await client.getQuote({
        inToken: input.quote.request.inToken, outToken: input.quote.request.outToken,
        inAmount: input.quote.request.inAmount, user: input.userAddress,
        slippage: input.quote.request.slippage, dexMinAmountOut: "-1", signal,
      });
      signal?.throwIfAborted();
      if (BigInt(fresh.netAmountOut) < BigInt(input.quote.minimumAmountOut)) {
        throw new SpotError("INVALID_QUOTE", "Swap price changed. Review a fresh quote before signing.");
      }
      // Preserve the exact minimum reviewed by the user; never weaken it on refresh.
      return client.prepareSwap(input.quote, input.userAddress);
    },
  });
  return {
    type: "intent", status: "submitted", orderId: result.order.id, order: result.order,
    deadlineMillis: result.order.deadline,
    wrapTxHash: result.wrapTxHash, approvalTxHash: result.approvalTxHash,
  };
}

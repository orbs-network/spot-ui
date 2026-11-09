import { executeOrder, type OrderExecutionUpdate, type OrderWalletInteractions } from "./execute-order";
import type { ApprovalRequest, OrderSigningRequest, SpotClient } from "./client";
import type { SwapQuote } from "./quote";
import type { Order, RePermitOrder } from "./types";
import { eqIgnoreCase } from "./utils";
import { SpotError } from "./errors";
import { captureValidatedSwap } from "./swap-validation";
import { createAnalyticsOperation } from "./analytics";
import { observe } from "./observe";
import { Module } from "./types";

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

const assertSubmitSwapOptions = (params: SubmitSwapParams): void => {
  if ("deadlineMillis" in params) {
    throw new SpotError("INVALID_ARGUMENT", "Swap expiration is fixed at 3 minutes; remove deadlineMillis");
  }
  if (["minimumOutputAmountRaw", "swapperAddress", "recipient", "tradeType"].some(field => field in params)) {
    throw new SpotError("INVALID_ARGUMENT", "Swap preparation uses the quote's minimumAmountOut and userAddress as the signer. Remove minimumOutputAmountRaw, swapperAddress, recipient, and tradeType; use isSwapSupported before quoting.");
  }
};

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
  const analytics = createAnalyticsOperation(client.analytics, {
    account: params.userAddress,
    chainId: client.chainId,
    partner: client.partner,
    module: Module.SWAP,
    inputTokenAddress: params.quote?.request?.inToken,
    outputTokenAddress: params.quote?.request?.outToken,
    inputAmountRaw: params.quote?.request?.inAmount,
    minimumOutputAmountRaw: params.quote?.minimumAmountOut,
  });
  try {
    // Options belong to this invocation; quote validity belongs to its frozen snapshot.
    assertSubmitSwapOptions(params);
    const input = captureValidatedSwap(params.quote, params.userAddress, client.chainId, client.partner);
    const result = await executeOrder({
      client, account: input.userAddress, inputTokenAddress: input.quote.request.inToken,
      inputAmountRaw: input.quote.request.inAmount, nativeInput, completedWrapTxHash,
      walletInteractions, signal, onUpdate, validateContext, analytics,
      prepareOrder: () => client.refreshAndPrepareSwap({
        quote: input.quote,
        account: input.userAddress,
        signal,
        analytics,
      }),
    });
    return {
      type: "intent", status: "submitted", orderId: result.order.id, order: result.order,
      deadlineMillis: result.order.deadline,
      wrapTxHash: result.wrapTxHash, approvalTxHash: result.approvalTxHash,
    };
  } catch (error) {
    observe(() => analytics.onExecutionError(error, "preparing"));
    throw error;
  }
}

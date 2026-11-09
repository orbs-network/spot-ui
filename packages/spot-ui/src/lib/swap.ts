import type { OrderWalletInteractions } from "./execute-order";
import { runOrderExecution, type OrderExecutionRuntime } from "./internal/execute-order";
import { getClientAnalytics, prepareClientSwap } from "./internal/client";
import type { ApprovalRequest, OrderSigningRequest, SpotClient } from "./client";
import type { SwapQuote } from "./quote";
import type { Order, RePermitOrder } from "./types";
import { eqIgnoreCase } from "./utils";
import { SpotError } from "./errors";
import { captureValidatedSwap } from "./swap-validation";
import { createAnalyticsOperation } from "./analytics";
import { observe } from "./observe";
import { Module } from "./types";
import { OrderSettlementError } from "./order-settlement-error";
import { waitForOrder } from "./internal/wait-for-order";

/** Trade direction requested by a router. Spot currently supports only `"exact-input"`. */
export type SwapTradeType = "exact-input" | "exact-output";

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

const assertExecuteSwapOptions = (params: ExecuteSwapParams): void => {
  if ("nativeInput" in params && params.nativeInput === true) {
    throw new SpotError("INVALID_ARGUMENT", "Wrapping is controlled by walletInteractions.shouldWrap; remove nativeInput");
  }
  if ("deadlineMillis" in params) {
    throw new SpotError("INVALID_ARGUMENT", "Swap expiration is fixed at 3 minutes; remove deadlineMillis");
  }
  if (["minimumOutputAmountRaw", "swapperAddress", "recipient", "tradeType"].some(field => field in params)) {
    throw new SpotError("INVALID_ARGUMENT", "Swap preparation uses the quote's minimumAmountOut and account as the signer. Remove minimumOutputAmountRaw, swapperAddress, recipient, and tradeType; use isSwapSupported before quoting.");
  }
};

/** Reviewed swap inputs plus the host's connected wallet adapter. */
export interface ExecuteSwapParams {
  /** Reviewed quote for this client's chain and partner. */
  quote: SwapQuote;
  /** Connected signer and output recipient, independent of the quote's preview user. */
  account: string;
  /** Wallet operations whose shouldWrap callback decides wrapping; transactions resolve after successful receipts. */
  walletInteractions: OrderWalletInteractions;
  /** Stops subsequent steps. Completed wallet transactions or accepted orders remain valid. */
  signal?: AbortSignal;
}
/** Swap intent whose fill has been confirmed by the order service. */
export interface CompletedSwap {
  type: "intent";
  status: "completed";
  /** Full signed order ID, also available as `order.id`. */
  orderId: string;
  /** Completed order snapshot, including its confirmed fill amounts. */
  order: Order;
  /** Accepted order expiration as Unix milliseconds, including protocol rounding to seconds; equals `order.deadline`. */
  deadlineMillis: number;
  /** Confirmed native wrapping transaction, when wrapping was requested by the host. */
  wrapTxHash?: string;
  /** Confirmed ERC-20 approval transaction, when additional allowance was required. */
  approvalTxHash?: string;
}

/**
 * Runs wallet orchestration for a reviewed exact-input swap.
 * Checks the host's shouldWrap decision, wraps native input and approves when needed, then
 * prepares fresh signing data, signs, submits once, and waits for a confirmed fill.
 *
 * @param client - Client bound by createClient; shares the account lock with executeOrder.
 * @param params - Reviewed quote, connected account, and wallet adapter.
 * @returns A completed intent and the filled order.
 * @throws If validation, a wallet operation, submission, or settlement fails.
 * Aborting stops later steps; it does not cancel transactions or an accepted order.
 * @example
 * const result = await client.executeSwap({
 *   quote, account, walletInteractions,
 * });
 */
export async function executeSwap(
  client: SpotClient,
  params: ExecuteSwapParams,
  submitOrder: OrderExecutionRuntime<PreparedSwap>["submitOrder"],
): Promise<CompletedSwap> {
  const { walletInteractions, signal, account } = params;
  const analytics = createAnalyticsOperation(getClientAnalytics(client), {
    account,
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
    assertExecuteSwapOptions(params);
    const input = captureValidatedSwap(params.quote, account, client.chainId, client.partner);
    const result = await runOrderExecution({
      account: input.userAddress, inputTokenAddress: input.quote.request.inToken,
      inputAmountRaw: input.quote.request.inAmount,
      walletInteractions, signal,
      prepareOrder: () => prepareClientSwap(client, {
        quote: input.quote,
        account: input.userAddress,
        signal,
      }, analytics),
    }, {
      client, analytics, submitOrder,
      settleOrder: (order, onUpdate) => waitForOrder({ order, signal, onUpdate, apiUrl: client.apiUrl, analytics }),
    });
    return {
      type: "intent", status: "completed", orderId: result.order.id, order: result.order,
      deadlineMillis: result.order.deadline,
      wrapTxHash: result.wrapTxHash, approvalTxHash: result.approvalTxHash,
    };
  } catch (error) {
    if (!(error instanceof OrderSettlementError)) observe(() => analytics.onExecutionError(error, "preparing"));
    throw error;
  }
}

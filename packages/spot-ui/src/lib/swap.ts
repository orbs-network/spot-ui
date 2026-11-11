import type { OrderWalletInteractions } from "./execute-order";
import type { ApprovalRequest, OrderSigningRequest } from "./client";
import type { SwapQuote } from "./quote";
import type { RePermitOrder } from "./types";
import { eqIgnoreCase } from "./utils";

/** Trade direction requested by a router. Spot currently supports only exact input. */
export type SwapTradeType = "exact-input" | "exact-output";

/** Locally prepared signing payload and approval requirements; no order has been submitted. */
export interface PreparedSwap {
  /** Protocol order to submit with its original wallet signature. */
  order: RePermitOrder;
  /** EIP-712 typed data and signer identity for the wallet adapter. */
  signingRequest: OrderSigningRequest;
  /** ERC-20 token, spender, exact input requirement, and suggested approval cap. */
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

/** Reviewed swap inputs plus the host's connected wallet adapter. */
export interface CreateSwapExecutionParams {
  /** Reviewed quote for this client's chain and partner. */
  quote: SwapQuote;
  /** Connected signer and output recipient, independent of the quote's preview user. */
  account: string;
  /** shouldWrap/shouldApprove decide which transactions are needed; transaction callbacks resolve with confirmed hashes. */
  walletInteractions: OrderWalletInteractions;
  /** Stops subsequent steps. Completed wallet transactions or accepted orders remain valid. */
  signal?: AbortSignal;
}

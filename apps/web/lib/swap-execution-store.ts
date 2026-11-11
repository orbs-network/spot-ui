import { create } from "zustand";
import type { Order, RePermitOrder, SpotClient, SwapQuote, SwapExecution } from "@orbs-network/spot-react";
import type { Currency } from "./types";

export type DirectSwapPhase = "idle" | "price-changed" | "preparing" | "wrapping" | "approving" | "signing" | "settling" | "success" | "failed" | "unconfirmed";
export type DirectSwapStep = "wrap" | "approve" | "create";

/** Input and wallet context selected when the review dialog opens. */
export interface SwapReviewContext {
  client: SpotClient;
  account: `0x${string}`;
  contextKey: string;
  inputToken: Currency;
  outputToken: Currency;
  inputAmountUi: string;
}

/** Confirmed quote retained as the minimum-output floor during execution. */
export interface SwapReview extends SwapReviewContext {
  quote: SwapQuote;
}

export interface DirectSwapState {
  phase: DirectSwapPhase;
  review?: SwapReview;
  error?: Error;
  order?: Order;
  signedOrder?: RePermitOrder;
  sdkExecution?: SwapExecution;
  wrapTxHash?: string;
  approvalTxHash?: string;
  /** Require a quote received after the rejected signing attempt before accepting a new price. */
  priceChangedAt?: number;
  steps: DirectSwapStep[];
  stepIndex: number;
}

export const idleSwapExecution = (): DirectSwapState => ({ phase: "idle", steps: [], stepIndex: 0 });

/** Host memory survives tab navigation; unresolved submissions never become new swaps on remount. */
export const useDirectSwapStore = create<{
  execution: DirectSwapState;
  controller?: AbortController;
  confirmedWrap?: { account: string; chainId: number; tokenAddress: string; hash: string; contextKey: string; amountRaw: string };
}>(() => ({ execution: idleSwapExecution() }));

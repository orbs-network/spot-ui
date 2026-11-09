import { create } from "zustand";
import type { Order, RePermitOrder, SpotClient, SwapQuote } from "@orbs-network/spot-react";
import type { Currency } from "./types";

export type DirectSwapPhase = "idle" | "preparing" | "wrapping" | "approving" | "signing" | "settling" | "success" | "failed" | "unconfirmed";
export type DirectSwapStep = "wrap" | "approve" | "create";

/** The exact quote and wallet context shown in the host's review dialog. */
export interface SwapReview {
  client: SpotClient;
  quote: SwapQuote;
  account: `0x${string}`;
  contextKey: string;
  inputToken: Currency;
  outputToken: Currency;
  inputAmountUi: string;
  outputAmountUi: string;
}

export interface DirectSwapState {
  phase: DirectSwapPhase;
  review?: SwapReview;
  error?: Error;
  order?: Order;
  signedOrder?: RePermitOrder;
  wrapTxHash?: string;
  approvalTxHash?: string;
  steps: DirectSwapStep[];
  stepIndex: number;
}

export const idleSwapExecution = (): DirectSwapState => ({ phase: "idle", steps: [], stepIndex: 0 });

/** Host memory survives tab navigation; unresolved submissions never become new swaps on remount. */
export const useDirectSwapStore = create<{
  execution: DirectSwapState;
  controller?: AbortController;
  confirmedWrap?: { contextKey: string; account: string; hash: string };
}>(() => ({ execution: idleSwapExecution() }));

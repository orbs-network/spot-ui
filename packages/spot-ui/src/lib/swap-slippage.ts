import BN from "bignumber.js";
import { SpotError } from "./errors";
import { getSlippageBps } from "./swap-amounts";

/** Inputs shared by the DEX's quote request and slippage display. */
export interface GetSwapSlippageParams {
  /** Total trade value in USD as a decimal string. Missing or invalid values retain the baseline. */
  amountUsd?: string;
  /** Positive automatic DEX baseline up to 50 percent, rounding to at least 1 basis point. */
  slippage: number;
}

/** One policy result to use for both quoting and UI; percentages match wire basis-point precision. */
export interface SwapSlippage {
  /** Effective percentage: 0.5 means 0.5%. */
  readonly slippagePercent: number;
  readonly slippageBps: number;
  /** Normalized positive USD value; undefined when unavailable. */
  readonly amountUsd?: string;
}

/**
 * Derives the shared automatic swap slippage from a total trade value in USD.
 * Positive trades worth $100 or less use at least 1%; larger trades retain the
 * DEX default. Missing, invalid, zero, or negative USD values retain the baseline.
 * The supplied percentage must round to at least one basis point.
 * This synchronous helper makes no requests and does not mutate settings.
 *
 * @returns Effective slippage as slippagePercent and integer slippageBps, plus amountUsd when known.
 * @throws `SpotError` for invalid slippage.
 * @example
 * const { slippagePercent, slippageBps } = getSwapSlippage({
 *   amountUsd: "50", slippage: 0.5,
 * }); // slippagePercent === 1, slippageBps === 100
 */
export function getSwapSlippage({
  amountUsd,
  slippage,
}: GetSwapSlippageParams): SwapSlippage {
  const baselineBps = getSlippageBps(slippage);
  if (baselineBps === 0) {
    throw new SpotError("INVALID_ARGUMENT", "Slippage must round to at least 1 basis point");
  }
  const baseline = Object.freeze({
    slippagePercent: baselineBps / 100,
    slippageBps: baselineBps,
    amountUsd: undefined,
  });
  if (typeof amountUsd !== "string" || !/^\d+(?:\.\d+)?$/.test(amountUsd)) {
    return baseline;
  }
  const usd = new BN(amountUsd);
  if (!usd.isFinite() || !usd.gt(0)) return baseline;
  const floorApplies = usd.lte(100) && baselineBps < 100;
  const slippageBps = floorApplies ? 100 : baselineBps;
  return Object.freeze({
    slippagePercent: slippageBps / 100,
    slippageBps,
    amountUsd: usd.toFixed(),
  });
}

import { SpotError } from "./errors";
import { MAX_ORDER_SLIPPAGE_BPS } from "./order-form/constants";

/**
 * Converts a DEX slippage percentage to the integer basis points sent to the quote service.
 *
 * @param slippage - Percentage from 0 through 50, inclusive; `0.5` means 0.5%.
 * @returns Basis points rounded to the nearest integer; `0.5` becomes `50`.
 * @throws If slippage is non-finite or outside the accepted percentage range.
 */
export function getSlippageBps(slippage: number): number {
  if (!Number.isFinite(slippage) || slippage < 0 || slippage > MAX_ORDER_SLIPPAGE_BPS / 100) {
    throw new SpotError("INVALID_ARGUMENT", `Slippage must be between 0 and ${MAX_ORDER_SLIPPAGE_BPS / 100} percent`);
  }
  return Math.round(slippage * 100);
}

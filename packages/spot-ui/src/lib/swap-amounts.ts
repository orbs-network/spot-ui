import { SpotError } from "./errors";

/**
 * Converts a slippage percentage to the integer basis points sent to the quote service.
 *
 * @param slippage - Percentage from 0 up to, but excluding, 100; `0.5` means 0.5%.
 * @returns Basis points rounded to the nearest integer; `0.5` becomes `50`.
 * @throws If slippage is non-finite or outside the accepted percentage range.
 */
export function getSlippageBps(slippage: number): number {
  if (!Number.isFinite(slippage) || slippage < 0 || slippage >= 100) {
    throw new SpotError("INVALID_ARGUMENT", "Slippage must be between 0 and 100 percent");
  }
  return Math.round(slippage * 100);
}

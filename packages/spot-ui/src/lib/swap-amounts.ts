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

/**
 * Calculates the minimum output shown to the user from a quote's net output.
 * Uses integer arithmetic and rounds down after applying slippage in basis points.
 * Pass the reviewed result as `minimumOutputAmountRaw` when preparing a swap.
 *
 * @param netAmountOut - Positive integer string in output-token base units, usually `quote.netAmountOut`.
 * @param slippage - Percentage; `0.5` means 0.5%.
 * @returns Minimum output as an integer string in output-token base units.
 * @throws If the amount or slippage is invalid, or the minimum rounds to zero.
 * @example
 * getMinimumOutputAmount("1000000", 0.5); // "995000"
 */
export function getMinimumOutputAmount(netAmountOut: string, slippage: number): string {
  if (!/^\d+$/.test(netAmountOut) || BigInt(netAmountOut) <= BigInt(0)) {
    throw new SpotError("INVALID_AMOUNT", "Net output must be a positive integer base-unit amount");
  }
  const minimum = BigInt(netAmountOut) * BigInt(10_000 - getSlippageBps(slippage)) / BigInt(10_000);
  if (minimum <= BigInt(0)) throw new SpotError("INVALID_AMOUNT", "Swap amount is too small. Increase the input amount.");
  return minimum.toString();
}

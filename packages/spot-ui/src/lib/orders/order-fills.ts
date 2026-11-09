import BN from "bignumber.js";
import type { OrderFill } from "../types";

/** Aggregate protocol amounts without converting token base units to floating point. */
export const getFilledAmounts = (fills: OrderFill[]): { input: string; output: string } => {
  let input = new BN(0);
  let output = new BN(0);
  for (const fill of fills) {
    input = input.plus(fill.inAmount);
    output = output.plus(fill.outAmount);
  }
  return { input: input.toFixed(), output: output.toFixed() };
};

export const getFilledOrderTimestamp = (fills: OrderFill[], totalTrades: number): number => {
  if (fills.length >= totalTrades) {
    return fills.reduce((latest, fill) => Math.max(latest, fill.timestamp), 0);
  }
  return 0;
};

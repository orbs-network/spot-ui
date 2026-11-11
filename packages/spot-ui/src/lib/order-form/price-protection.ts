import { SpotError } from "../errors";
import { MAX_ORDER_SLIPPAGE_BPS } from "./constants";

export const assertOrderSlippageBps = (slippageBps: number): void => {
  if (!Number.isSafeInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_ORDER_SLIPPAGE_BPS) {
    throw new SpotError("INVALID_ARGUMENT", `slippageBps must be an integer from 0 to ${MAX_ORDER_SLIPPAGE_BPS}`);
  }
};

export const getPriceProtectionBps = (percent: number): number => {
  if (!Number.isFinite(percent) || percent < 0 || percent > MAX_ORDER_SLIPPAGE_BPS / 100) {
    throw new SpotError("INVALID_ARGUMENT", `priceProtectionPercent must be finite and from 0 to ${MAX_ORDER_SLIPPAGE_BPS / 100}`);
  }
  return Math.round(percent * 100);
};

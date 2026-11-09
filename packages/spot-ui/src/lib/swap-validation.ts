import type { PrepareSwapParams } from "./swap";
import { snapshotSwapQuote, type SwapQuote } from "./quote";
import type { Partners } from "./types";
import { eqIgnoreCase, isNativeAddress } from "./utils";
import { SpotError } from "./errors";
import { getSlippageBps } from "./swap-amounts";

interface ValidationContext {
  chainId: number;
  partner: Partners;
  account: string;
}

// Only snapshots created and validated here can reuse a result. External frozen
// objects can still contain getters, so Object.isFrozen alone is not sufficient.
const validatedQuotes = new WeakMap<SwapQuote, ValidationContext>();

const validateSwapQuote = (
  quote: SwapQuote,
  userAddress: string,
  chainId: number,
  partner: Partners,
): void => {
  if (!quote.request || quote.request.chainId !== chainId || quote.request.partner !== partner) {
    throw new SpotError("QUOTE_CONTEXT_MISMATCH", "Swap quote does not match the client chain or partner");
  }
  for (const address of [quote.request.inToken, quote.request.outToken, userAddress]) {
    if (typeof address !== "string" || !/^0x[0-9a-f]{40}$/i.test(address)) {
      throw new SpotError("INVALID_ARGUMENT", "Invalid swap token or signer address");
    }
  }
  if (isNativeAddress(quote.request.inToken) || isNativeAddress(userAddress)) {
    throw new SpotError("UNSUPPORTED_SWAP", "Swap input must be the host's wrapped token and the signer must be nonzero");
  }
  if (eqIgnoreCase(quote.request.inToken, quote.request.outToken)) {
    throw new SpotError("UNSUPPORTED_SWAP", "Swap input and output tokens must be different");
  }
  for (const amount of [quote.request.inAmount, quote.netAmountOut, quote.minimumAmountOut]) {
    if (typeof amount !== "string" || !/^\d+$/.test(amount) || BigInt(amount) <= BigInt(0)) {
      throw new SpotError("INVALID_AMOUNT", "Swap amounts must be positive integer base-unit amounts");
    }
  }
  if (BigInt(quote.minimumAmountOut) > BigInt(quote.netAmountOut)) {
    throw new SpotError("INVALID_QUOTE", "Swap minimum exceeds the net quote");
  }
  getSlippageBps(quote.request.slippage);
};

/** Capture once before wallet work; later preparation reuses the validated immutable input. */
export const captureValidatedSwap = (
  quote: SwapQuote,
  userAddress: string,
  chainId: number,
  partner: Partners,
): PrepareSwapParams => {
  const context = quote && validatedQuotes.get(quote);
  if (context && context.chainId === chainId && context.partner === partner &&
    typeof userAddress === "string" && context.account === userAddress.toLowerCase()) {
    return { quote, userAddress };
  }
  if (!quote?.request) {
    throw new SpotError("QUOTE_CONTEXT_MISMATCH", "Swap quote does not match the client chain or partner");
  }
  const reviewedQuote = snapshotSwapQuote(quote);
  validateSwapQuote(reviewedQuote, userAddress, chainId, partner);
  validatedQuotes.set(reviewedQuote, { chainId, partner, account: userAddress.toLowerCase() });
  return { quote: reviewedQuote, userAddress };
};

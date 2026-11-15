import BN from "bignumber.js";
import { getApiEndpoint } from "./api-config";
import { awaitWithSignal } from "./await-with-signal";
import { SpotError } from "./errors";
import { isQuoteAbortError } from "./quote-error";
import { getSlippageBps } from "./swap-amounts";
import { getTokenUsd, type GetTokenUsdParams } from "./token-usd";

const PRICE_WAIT_MILLIS = 1_500;

/** Inputs shared by the DEX's quote request and slippage display. */
export interface GetSwapSlippageParams extends GetTokenUsdParams {
  /** Amount as typed in whole tokens, for example "50.25". Pass a decimal string, not base units. */
  typedInputAmount?: string;
  /** Optional USD unit-price override or pending lookup. Omit to use the SDK's shared price cache. */
  inputTokenUsd?: string | Promise<string>;
  /** Positive DEX slippage up to 50 percent, rounding to at least 1 basis point: the automatic baseline or custom value. */
  slippage: number;
  /** Use slippage directly when true; false selects automatic policy with the supplied baseline. */
  isCustom: boolean;
}

/** One policy result to use for both quoting and UI; percentages match wire basis-point precision. */
export interface SwapSlippage {
  /** Effective percentage: 0.5 means 0.5%. */
  readonly slippagePercent: number;
  readonly slippageBps: number;
  /** Exact input USD value in automatic mode; undefined for custom slippage or unavailable input/pricing. */
  readonly inputAmountUsd?: string;
}

/**
 * Waits for a USD price, then derives the shared automatic swap slippage.
 * Positive trades worth $100 or less use at least 1%; larger trades retain the
 * DEX default. Automatic mode uses the shared price cache or fetches on a miss;
 * supply a price or pending promise to override that lookup. Missing, invalid, or
 * failed pricing retains the DEX baseline with no input USD value. Pricing is
 * awaited for at most 1.5 seconds; shared lookups continue to populate the cache.
 * Empty or zero input retains the baseline without fetching or waiting for pricing.
 * With isCustom enabled, the percentage returns directly without waiting for
 * pricing. The supplied percentage must round to at least one basis point.
 * Price lookups share getTokenUsd's 10-minute cache. This function does not mutate settings.
 *
 * @returns Effective slippage as slippagePercent and integer slippageBps, plus inputAmountUsd when known.
 * @throws `SpotError` for invalid inputs; request aborts propagate unchanged.
 * @example
 * const { slippagePercent, slippageBps } = await getSwapSlippage({
 *   tokenAddress, chainId: 56,
 *   typedInputAmount: "50",
 *   inputTokenUsd: "1", slippage: 0.5, isCustom: false,
 * }); // slippagePercent === 1, slippageBps === 100
 */
export async function getSwapSlippage({
  tokenAddress,
  chainId,
  apiUrl,
  signal,
  typedInputAmount,
  inputTokenUsd,
  slippage,
  isCustom,
}: GetSwapSlippageParams): Promise<SwapSlippage> {
  const pricePromise = inputTokenUsd === undefined ? undefined : Promise.resolve(inputTokenUsd);
  // Observe shared price work even when cancellation or validation exits before the await.
  // Automatic pricing failures below retain the DEX baseline.
  void pricePromise?.catch(() => {});
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new SpotError("INVALID_ARGUMENT", "chainId must be a positive safe integer");
  }
  if (typeof tokenAddress !== "string" || !/^0x[0-9a-f]{40}$/i.test(tokenAddress)) {
    throw new SpotError("INVALID_ARGUMENT", "tokenAddress must be an EVM address");
  }
  const endpoint = getApiEndpoint(apiUrl);
  const baselineBps = getSlippageBps(slippage);
  if (baselineBps === 0) {
    throw new SpotError("INVALID_ARGUMENT", "Slippage must round to at least 1 basis point");
  }
  if (typeof isCustom !== "boolean") {
    throw new SpotError("INVALID_ARGUMENT", "isCustom must be a boolean");
  }
  let amount: BN | undefined;
  if (typedInputAmount !== undefined && typedInputAmount !== "" && typedInputAmount !== ".") {
    if (typeof typedInputAmount !== "string" || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(typedInputAmount)) {
      throw new SpotError("INVALID_ARGUMENT", "typedInputAmount must be a non-negative decimal string in whole tokens");
    }
    amount = new BN(typedInputAmount);
    if (!amount.isFinite()) {
      throw new SpotError("INVALID_ARGUMENT", "typedInputAmount must be finite");
    }
  }
  const baseline = Object.freeze({
    slippagePercent: baselineBps / 100,
    slippageBps: baselineBps,
    inputAmountUsd: undefined,
  });
  if (isCustom || !amount?.gt(0)) {
    return baseline;
  }
  let priceValue: string | undefined;
  let priceTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const lookup = pricePromise ?? getTokenUsd({ tokenAddress, chainId, apiUrl: endpoint });
    priceValue = await awaitWithSignal(Promise.race([
      lookup,
      new Promise<undefined>(resolve => {
        priceTimeout = setTimeout(() => resolve(undefined), PRICE_WAIT_MILLIS);
      }),
    ]), signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (isQuoteAbortError(error)) throw error;
    return baseline;
  } finally {
    clearTimeout(priceTimeout);
  }
  signal?.throwIfAborted();
  if (typeof priceValue !== "string" || !/^\d+(?:\.\d+)?$/.test(priceValue)) {
    return baseline;
  }
  const price = new BN(priceValue);
  if (!price.isFinite() || !price.gt(0)) return baseline;
  // Both inputs are decimal strings in whole-token units; multiplication preserves the $100 boundary.
  const usd = amount.times(price);
  if (!usd.isFinite()) return baseline;
  const floorApplies = usd.lte(100) && baselineBps < 100;
  const slippageBps = floorApplies ? 100 : baselineBps;
  return Object.freeze({
    slippagePercent: slippageBps / 100,
    slippageBps,
    inputAmountUsd: usd.toFixed(),
  });
}

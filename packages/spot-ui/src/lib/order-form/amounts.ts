import BN from "bignumber.js";
import type {
  CalculatedAmount,
  CalculatedMarketPriceValues,
} from "./types";

export const normalizeAmount = (value?: string): string => {
  if (!value) return "";
  const amount = BN(value);
  return amount.isFinite() && !amount.isNaN() ? value : "";
};

/**
 * Converts a decimal token amount into an integer string of token base units.
 * Fractional base units are rounded using BigNumber's configured rounding mode.
 *
 * @param value Token amount in UI units, for example `"1.5"`.
 * @param decimals The token's decimal precision, for example `6` for USDC.
 * @returns Base units, or `""` when an argument is missing or the amount is not finite.
 * @example toAmountRaw("1.5", 6) // "1500000"
 */
export const toAmountRaw = (value?: string, decimals?: number): string => {
  if (decimals == null || !value) return "";
  const amount = BN(value);
  if (!amount.isFinite() || amount.isNaN()) return "";
  return amount.multipliedBy(BN(10).pow(decimals)).toFixed(0);
};

/**
 * Converts token base units into a decimal token amount without display formatting.
 *
 * @param value Token base units as a decimal string.
 * @param decimals The token's decimal precision.
 * @returns A decimal amount, or `""` when an argument is missing or the amount is not finite.
 * @example toAmountUI("1500000", 6) // "1.5"
 */
export const toAmountUI = (value?: string, decimals?: number): string => {
  if (decimals == null || !value) return "";
  const amount = BN(value);
  if (!amount.isFinite() || amount.isNaN()) return "";
  return amount.dividedBy(BN(10).pow(decimals)).toFixed();
};

export const calculateUsdAmount = (
  amountUI?: string,
  usdPrice?: string | number,
): string => {
  if (!amountUI || !usdPrice) return "";
  const amount = BN(amountUI);
  const price = BN(usdPrice);
  if (
    !amount.isFinite() ||
    amount.isNaN() ||
    amount.isZero() ||
    !price.isFinite() ||
    price.isNaN() ||
    price.isZero()
  ) {
    return "";
  }
  return amount.multipliedBy(price).toFixed();
};

export const calculateAmountValues = (
  amount: string,
  decimals: number,
  usdPrice?: string,
): CalculatedAmount => {
  const normalizedAmount = normalizeAmount(amount);
  const ui = toAmountUI(normalizedAmount, decimals);

  return {
    raw: normalizedAmount,
    ui,
    usd: calculateUsdAmount(ui, usdPrice),
  };
};

export const calculateMarketPriceValues = ({
  quotedOutputAmountRaw,
  inputAmountUi,
  outputTokenDecimals,
  outputUsdPrice,
}: {
  quotedOutputAmountRaw?: string;
  inputAmountUi?: string;
  outputTokenDecimals: number;
  outputUsdPrice?: string;
}): CalculatedMarketPriceValues => {
  const normalizedOutputAmount = normalizeAmount(quotedOutputAmountRaw);
  const normalizedInputAmount = normalizeAmount(inputAmountUi);
  const raw =
    normalizedOutputAmount &&
    normalizedInputAmount &&
    BN(normalizedInputAmount).gt(0)
      ? BN(normalizedOutputAmount).dividedBy(normalizedInputAmount).toFixed()
      : "";
  const ui = toAmountUI(raw, outputTokenDecimals);

  return {
    raw,
    ui,
    usd: calculateUsdAmount(ui, outputUsdPrice),
  };
};

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

export const toAmountRaw = (value?: string, decimals?: number): string => {
  if (decimals == null || !value) return "";
  const amount = BN(value);
  if (!amount.isFinite() || amount.isNaN()) return "";
  return amount.multipliedBy(BN(10).pow(decimals)).toFixed(0);
};

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

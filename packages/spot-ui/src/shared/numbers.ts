import BN from "bignumber.js";
export const amountUi = (decimals?: number, amount?: string) => {
  if (decimals == null || !amount) return "";
  const precision = BN(10).pow(decimals);
  return BN(amount).times(precision).idiv(precision).div(precision).toFixed();
};

export const safeBNString = (value?: string | number) => {
  if (!value || value === "NaN") return "0";
  return BN(value).decimalPlaces(0).toFixed();
};

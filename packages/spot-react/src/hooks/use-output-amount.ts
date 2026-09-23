import { useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotTrading } from "../context/spot-trading-context";

export const useOutputAmount = () => {
  const { marketPriceLoading } = useSpotTrading();
  const { outputAmount } = useOrderForm();

  return useMemo(
    () => ({
      amount: outputAmount,
      isLoading: Boolean(marketPriceLoading),
    }),
    [marketPriceLoading, outputAmount],
  );
};

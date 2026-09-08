import { useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotRuntime } from "../context/spot-runtime-context";

export const useOutputAmount = () => {
  const { marketPriceLoading } = useSpotRuntime();
  const { outputAmount } = useOrderForm();

  return useMemo(
    () => ({
      amount: outputAmount,
      isLoading: Boolean(marketPriceLoading),
    }),
    [marketPriceLoading, outputAmount],
  );
};

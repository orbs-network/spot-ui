import { useMemo } from "react";
import { useSpotTrading } from "../../provider/trading-context";
import { useOrderForm } from "../form-context";

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

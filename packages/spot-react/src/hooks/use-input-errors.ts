import { useOrderForm } from "../context/order-form-context";
import { useSpotTrading } from "../context/spot-trading-context";

export const useInputErrors = () => {
  const { marketPriceLoading } = useSpotTrading();
  const error = useOrderForm().errors.primary;

  return marketPriceLoading ? undefined : error;
};

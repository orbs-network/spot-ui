import { useOrderForm } from "../context/order-form-context";
import { useSpotRuntime } from "../context/spot-store";

export const useInputErrors = () => {
  const { marketPriceLoading } = useSpotRuntime();
  const error = useOrderForm().errors.primary;

  return marketPriceLoading ? undefined : error;
};

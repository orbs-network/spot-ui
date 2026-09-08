import { useOrderForm } from "../context/order-form-context";
import { useSpotRuntime } from "../context/spot-runtime-context";

export const useInputErrors = () => {
  const { marketPriceLoading } = useSpotRuntime();
  const error = useOrderForm().errors.primary;

  return marketPriceLoading ? undefined : error;
};

import { useSpotTrading } from "../../provider/trading-context";
import { useOrderForm } from "../form-context";

export const useInputErrors = () => {
  const { marketPriceLoading } = useSpotTrading();
  const error = useOrderForm().errors.primary;

  return marketPriceLoading ? undefined : error;
};

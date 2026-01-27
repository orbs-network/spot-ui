import { useSpotContext } from "../spot-context";
import { useDstTokenAmount } from "./use-dst-amount";


export const useDstTokenPanel = () => {
  const { typedInputAmount, marketPriceLoading } = useSpotContext();
  const dstAmount = useDstTokenAmount().amountUI;

  return {
    value: typedInputAmount ? dstAmount : "",
    isLoading: marketPriceLoading,
  };
};

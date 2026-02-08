import { useSpotContext } from "../spot-context";
import { useAmountBN, useFormatDecimals, useShouldWrapOrUnwrapOnly } from "./helper-hooks";
import { useDstTokenAmount } from "./use-dst-amount";


export const useDstTokenPanel = () => {
  const { typedInputAmount, marketPriceLoading, dstToken } = useSpotContext();
  const {amountUI: dstAmount, usd} = useDstTokenAmount();
  const isWrapOrUnwrapOnly = useShouldWrapOrUnwrapOnly();

  const value = isWrapOrUnwrapOnly ? typedInputAmount : dstAmount

  return {
    value: useFormatDecimals(value, 7),
    valueWei: useAmountBN(dstToken?.decimals, value),
    isLoading: marketPriceLoading,
    usd,
  };
};

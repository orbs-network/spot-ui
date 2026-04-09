import { useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useAmountBN, useShouldWrapOrUnwrapOnly } from "./helper-hooks";
import { useDstTokenAmount } from "./use-dst-amount";


export const useDstTokenPanel = () => {
  const { typedInputAmount, marketPriceLoading, dstToken } = useSpotContext();
  const {amountUI: dstAmount, usd} = useDstTokenAmount();
  const isWrapOrUnwrapOnly = useShouldWrapOrUnwrapOnly();

  const value = isWrapOrUnwrapOnly ? typedInputAmount : dstAmount;
  const valueWei = useAmountBN(dstToken?.decimals, value);

  return useMemo(() => ({
    value,
    valueWei,
    isLoading: marketPriceLoading,
    usd,
  }), [value, valueWei, marketPriceLoading, usd]);
};

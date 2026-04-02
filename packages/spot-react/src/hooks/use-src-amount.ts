import { useSpotContext } from "../spot-context";
import { useAmountBN } from "./helper-hooks";
import BN from "bignumber.js";

export const useSrcAmount = () => {
  const { srcToken, typedInputAmount } = useSpotContext();


  return {
    amountWei: useAmountBN(srcToken?.decimals, typedInputAmount),
    amountUI: typedInputAmount,
    error: BN(typedInputAmount || 0).isZero() ? "enterAmount" : undefined,
  };
};


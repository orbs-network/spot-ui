import { useSpotContext } from "../spot-context";
import { useAmountBN } from "./helper-hooks";
import { useSwapExecution } from "./use-swap-execution";
import BN from "bignumber.js";

export const useSrcAmount = () => {
  const { srcToken, typedInputAmount } = useSpotContext();

  const acceptedSrcAmount = useSwapExecution().acceptedSrcAmount;

  const value = acceptedSrcAmount || typedInputAmount;

  return {
    amountWei: useAmountBN(srcToken?.decimals, value),
    amountUI: value,
    error: BN(value || 0).isZero() ? "enterAmount" : undefined,
  };
};


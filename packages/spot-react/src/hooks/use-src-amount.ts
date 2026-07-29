import { useSpotContext } from "../spot-context";
import { useAmountBN } from "./helper-hooks";
import { useSwapExecution } from "./use-swap-execution";
import { SwapStatus } from "../types";
import { toAmountUi } from "../utils";
import BN from "bignumber.js";

export const useSrcAmount = () => {
  const { srcToken, typedInputAmount } = useSpotContext();
  const swapExecution = useSwapExecution();
  const liveAmount = useAmountBN(srcToken?.decimals, typedInputAmount);

  // Once an execution is in flight, freeze the source amount to the snapshot
  // taken at accept time so the signed order (and every derived value: chunks,
  // per-trade amount, min-out) matches the confirmation the user approved,
  // even if the host's input field changes mid-flow.
  const frozenAmount =
    swapExecution.status === SwapStatus.LOADING && swapExecution.acceptedSrcAmount
      ? swapExecution.acceptedSrcAmount
      : undefined;

  const amount = frozenAmount ?? liveAmount;
  const amountUI = frozenAmount
    ? toAmountUi(frozenAmount, srcToken?.decimals)
    : typedInputAmount;

  return {
    amount,
    amountUI,
    error: BN(amount || 0).isZero() ? "enterAmount" : undefined,
  };
};


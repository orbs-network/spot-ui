import { useSpotContext } from "../spot-context";
import { useDstTokenAmount } from "./use-dst-amount";
import { useMemo } from "react";
import BN from "bignumber.js";
import { useUsdAmount } from "./helper-hooks";

export const useFees = () => {
    const { fees, dstUsd1Token } = useSpotContext();
    const { amountUI: dstAmount } = useDstTokenAmount();
  
    const amount = useMemo(() => {
      if (!fees || !dstAmount) return "";
      return BN(dstAmount).multipliedBy(fees).dividedBy(100).toFixed();
    }, [dstAmount, fees]);

    
  
    return {
      amount,
      percent: fees,
      usd: useUsdAmount(amount, dstUsd1Token),
    };
  };
  
import { useSpotContext } from "../spot-context";
import { useDstTokenAmount } from "./use-dst-amount";
import { useMemo } from "react";
import BN from "bignumber.js";
import { useAmountBN, useUsdAmount } from "./helper-hooks";

export const useFees = () => {
    const { fees, dstToken, dstUsd1Token } = useSpotContext();
    const { amountUI: dstAmount } = useDstTokenAmount();
  
    const amountUI = useMemo(() => {
      if (!fees || !dstAmount) return "";
      return BN(dstAmount).multipliedBy(fees).dividedBy(100).toFixed();
    }, [dstAmount, fees]);


    const amount = useAmountBN(dstToken?.decimals || 0, amountUI);
    
  
    return {
      amountUI,
      amount,
      percent: fees,
      usd: useUsdAmount(amountUI, dstUsd1Token),
    };
  };
  
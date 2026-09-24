import { useConnection } from "wagmi";
import { Button } from "./ui/button";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useBalance } from "@/lib/hooks/use-balances";
import BN from "bignumber.js";
import { useMemo } from "react";

export const SubmitSwapButton = ({
  onClick,
  isLoading,
  text,
  disabled,
  forceAction = false,
}: {
  onClick: () => void;
  isLoading: boolean;
  text: string;
  disabled?: boolean;
  forceAction?: boolean;
}) => {
  const { address } = useConnection();
  const { openConnectModal } = useConnectModal();
  const { inputCurrency, outputCurrency, parsedInputAmount, isLoadingTrade, trade } = useDerivedSwap();
  const inputTokenBalance = useBalance(inputCurrency).wei;



  const insufficientBalance = useMemo(() => {
    return BN(inputTokenBalance ?? "0").lt(parsedInputAmount ?? "0");
  }, [inputTokenBalance, parsedInputAmount]);
  const enterAmount = BN(parsedInputAmount ?? "0").eq(0) 

  const insufficientLiquidity = !isLoadingTrade && BN(trade?.outAmount ?? "0").isZero();

  const _disabled = forceAction
    ? disabled || isLoading
    : disabled || !inputCurrency || !outputCurrency || isLoading || insufficientBalance || enterAmount || insufficientLiquidity;

  const _text = useMemo(() => {
    if (forceAction) {
      return text;
    }
    if (enterAmount) {
      return "Enter an amount";
    }
    if (isLoadingTrade) {
      return "Fetching quote...";
    }
    if (insufficientBalance) {
      return "Insufficient balance";
    }
    if(insufficientLiquidity) {
      return "Insufficient liquidity";
    }  
    return text;
  }, [enterAmount, forceAction, insufficientBalance, text, isLoadingTrade, insufficientLiquidity]);


  if (!address) {
    return (
      <Button
        onClick={() => {
          openConnectModal?.();
        }}
      >
        Connect Wallet
      </Button>
    );
  }


  return (
    <Button onClick={onClick} isLoading={isLoading  && !insufficientLiquidity} disabled={_disabled}>
      {_text}
    </Button>
  );
};

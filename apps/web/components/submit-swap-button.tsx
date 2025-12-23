import { useConnection, useSwitchChain } from "wagmi";
import { Button } from "./ui/button";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { getChainName } from "@/lib/utils";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useBalance } from "@/lib/hooks/use-balances";
import BN from "bignumber.js";
import { useMemo } from "react";

export const SubmitSwapButton = ({
  onClick,
  isLoading,
  text,
  chainId,
  disabled,
}: {
  onClick: () => void;
  isLoading: boolean;
  text: string;
  chainId?: number;
  disabled?: boolean;
}) => {
  const { address, chainId: currentChainId } = useConnection();
  const { openConnectModal } = useConnectModal();
  const switchChain = useSwitchChain();
  const { inputCurrency, outputCurrency, parsedInputAmount, isLoadingTrade, trade } = useDerivedSwap();
  const inputTokenBalance = useBalance(inputCurrency).wei;



  const insufficientBalance = useMemo(() => {
    return BN(inputTokenBalance ?? "0").lt(parsedInputAmount ?? "0");
  }, [inputTokenBalance, parsedInputAmount]);
  const enterAmount = BN(parsedInputAmount ?? "0").eq(0) 

  const insufficientLiquidity = !isLoadingTrade && BN(trade?.outAmount ?? "0").isZero();

  const _disabled = disabled || !inputCurrency || !outputCurrency || isLoading || insufficientBalance || enterAmount || insufficientLiquidity;

  const _text = useMemo(() => {
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
  }, [enterAmount, insufficientBalance, text, isLoadingTrade, insufficientLiquidity]);


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

  if (chainId && currentChainId && currentChainId !== chainId) {
    return (
      <Button
        onClick={() => {
          switchChain.mutate({ chainId });
        }}
      >
        Switch to {getChainName(chainId)} Network
      </Button>
    );
  }

  return (
    <Button onClick={onClick} isLoading={isLoading  && !insufficientLiquidity} disabled={_disabled}>
      {_text}
    </Button>
  );
};

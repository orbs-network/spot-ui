"use client";
import { CurrencyCard } from "./currency-card";
import { useSwapBestTrade } from "@/lib/hooks/use-swap-best-trade";
import { ToggleCurrencies } from "./toggle-currencies";
import { SubmitSwapButton } from "./submit-swap-button";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { Step, SwapFlow, SwapStatus, Token } from "@orbs-network/swap-ui";
import { ReactNode, useCallback, useMemo, useState } from "react";
import { useFormatNumber, useToAmountUI } from "@/lib/hooks/common";
import { useBestTradeSwapStore } from "@/lib/hooks/store";
import { Field, SwapStep } from "@/lib/types";
import { Avatar, AvatarImage } from "./ui/avatar";
import { useUSDPrice } from "@/lib/hooks/use-usd-price";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import BN from "bignumber.js";
import { FormContainer } from "./form-container";
import { getExplorerUrl } from "@/lib/utils";
import { useConnection } from "wagmi";
import { Spinner } from "./ui/spinner";

const useStep = () => {
  const { currentStep } = useBestTradeSwapStore();
  return useMemo((): Step | undefined => {
    if (currentStep === SwapStep.WRAP) {
      return {
        title: "Wrap",
        footerText: "Wrap your tokens",
      };
    } else if (currentStep === SwapStep.APPROVE) {
      return {
        title: "Approve",
        footerText: "Approve your tokens",
      };
    } else if (currentStep === SwapStep.SIGN) {
      return {
        title: "Sign",
        footerText: "Sign the swap request in your wallet",
      };
    } else if (currentStep === SwapStep.SWAP) {
      return {
        title: "Swap",
        footerText: "Swap your tokens",
      };
    }
    return undefined;
  }, [currentStep]);
};

const TokenLogo = ({ token }: { token: Token }) => {
  return (
    <Avatar className="token-logo">
      <AvatarImage src={token.logoUrl} />
    </Avatar>
  );
};

const Detail = ({ title, value }: { title: string; value: ReactNode }) => {
  return (
    <div className="flex  gap-2 items-center justify-between w-full">
      <p className="text-sm font-medium">{title}</p>
      <div className="text-sm">{value}</div>
    </div>
  );
};

const NetworkCost = () => {
  const { trade, outputCurrency } = useDerivedSwap();
  const amount = useToAmountUI(outputCurrency?.decimals, trade?.gas);
  const usd = useUSDPrice({
    token: outputCurrency?.address,
    amount: amount,
  });
  return <Detail title="Network Cost" value={`$${usd.formatted ?? "0"}`} />;
};

const PriceImpact = () => {
  const { outputCurrency, inputAmount, inputCurrency, outputAmount } =
    useDerivedSwap();
  const inputUsd = useUSDPrice({
    token: inputCurrency?.address,
    amount: inputAmount,
  });
  const outputUsd = useUSDPrice({
    token: outputCurrency?.address,
    amount: outputAmount,
  });
  const priceImpact = useMemo(() => {
    return BN(100).minus(
      BN(outputUsd.data ?? 0)
        .div(inputUsd.data ?? 0)
        .multipliedBy(100)
        .toNumber()
    );
  }, [outputUsd.data, inputUsd.data]);
  return <Detail title="Price Impact" value={`${priceImpact.toFixed(2)}%`} />;
};

const Rate = () => {
  const { inputAmount, outputAmount, inputCurrency, outputCurrency } =
    useDerivedSwap();

  const rate = useMemo(() => {
    return BN(outputAmount).div(inputAmount).toNumber();
  }, [outputAmount, inputAmount]);
  return (
    <Detail
      title="Rate"
      value={`1 ${inputCurrency?.symbol} = ${rate.toFixed(2)} ${
        outputCurrency?.symbol
      }`}
    />
  );
};

const MinimumAmountOut = () => {
  const { trade, outputCurrency } = useDerivedSwap();
  const amount = useToAmountUI(outputCurrency?.decimals, trade?.minAmountOut);
  const formatted = useFormatNumber({ value: amount });
  return (
    <Detail
      title="Minimum Amount Out"
      value={`${formatted ?? "0"} ${outputCurrency?.symbol}`}
    />
  );
};
const Details = () => {
  return (
    <div className="flex flex-col gap-2 w-full mt-4 bg-accent p-3 rounded-lg">
      <NetworkCost />
      <PriceImpact />
      <MinimumAmountOut />
      <Rate />
    </div>
  );
};

const Success = () => {
  const { txHash } = useSwapBestTrade();
  const { chainId } = useConnection();

  return <SwapFlow.Success footerLink={getExplorerUrl(chainId, txHash)} footerText="View on explorer" />;
};

const SubmitSwap = () => {
  const [open, setOpen] = useState(false);
  const {
    inputCurrency,
    outputCurrency,
    inputAmount,
    outputAmount,
    isLoadingTrade,
  } = useDerivedSwap();
  const { setInputAmount, } = useActionHandlers();
  const { status, totalSteps, currentStepIndex, reset } = useSwapBestTrade();
  const inputAmountF = useFormatNumber({ value: inputAmount });
  const outputAmountF = useFormatNumber({ value: outputAmount });

  const inToken = useMemo(() => {
    return {
      symbol: inputCurrency?.symbol,
      logoUrl: inputCurrency?.logoUrl,
    };
  }, [inputCurrency]);

  const outToken = useMemo(() => {
    return {
      symbol: outputCurrency?.symbol,
      logoUrl: outputCurrency?.logoUrl,
    };
  }, [outputCurrency]);

  const onClose = useCallback(() => {
    setOpen(false);
    if(status === SwapStatus.SUCCESS) {
      setInputAmount('');
    }
  }, [setInputAmount, status]);


  const onOpen = useCallback(() => {
    setOpen(true);
   if(status !== SwapStatus.LOADING) {
    reset();
   }
  }, [reset, status]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <SubmitSwapButton
        onClick={onOpen}
        isLoading={isLoadingTrade}
        text={isLoadingTrade ? "Fetching Quote..." : "Submit Swap"}
      />
      <DialogContent>
        <DialogHeader>
          {!status && <DialogTitle>Review</DialogTitle>}
        </DialogHeader>
        <SwapFlow
          inAmount={inputAmountF}
          outAmount={outputAmountF}
          swapStatus={status}
          totalSteps={totalSteps}
          currentStep={useStep()}
          currentStepIndex={currentStepIndex}
          inToken={inToken}
          outToken={outToken}
          components={{
            SrcTokenLogo: TokenLogo && <TokenLogo token={inToken} />,
            DstTokenLogo: TokenLogo && <TokenLogo token={outToken} />,
            Failed: <SwapFlow.Failed />,
            Success: <Success />,
            Main: <Main />,
            Loader: <Spinner className="size-18" />,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

const Main = () => {
  const { inputAmount, outputAmount, inputCurrency, outputCurrency } =
    useDerivedSwap();
  const { status, onSwapBestTrade } = useSwapBestTrade();
  const inputUsd = useUSDPrice({
    token: inputCurrency?.address,
    amount: inputAmount,
  });
  const outputUsd = useUSDPrice({
    token: outputCurrency?.address,
    amount: outputAmount,
  });
  const inputUsdFormatted = useFormatNumber({ value: inputUsd.data });
  const outputUsdFormatted = useFormatNumber({ value: outputUsd.data });
  return (
    <>
      <SwapFlow.Main
        fromTitle="From"
        toTitle="To"
        inUsd={
          <p className="text-sm text-muted-foreground">${inputUsdFormatted}</p>
        }
        outUsd={
          <p className="text-sm text-muted-foreground">${outputUsdFormatted}</p>
        }
      />
      {!status && (
        <div className="flex flex-col gap-2 w-full mt-4">
          <Details />
          <SubmitSwapButton
            onClick={onSwapBestTrade}
            isLoading={status === SwapStatus.LOADING}
            text="Confirm Swap"
          />
        </div>
      )}
    </>
  );
};

export function SwapBestTradeForm() {
  const { inputCurrency, outputCurrency, inputAmount, outputAmount, isLoadingTrade } =
    useDerivedSwap();
  const { setInputAmount, handleCurrencyChange } = useActionHandlers();

  return (
    <FormContainer>
      <div className="flex flex-col gap-0">
        <CurrencyCard
          currency={inputCurrency}
          onCurrencyChange={(currency: string) =>
            handleCurrencyChange(currency, Field.INPUT)
          }
          onAmountChange={setInputAmount}
          amount={inputAmount}
          title="From"
        />
        <ToggleCurrencies />
        <CurrencyCard
          currency={outputCurrency}
          onCurrencyChange={(currency: string) =>
            handleCurrencyChange(currency, Field.OUTPUT)
          }
          disabled={true}
          amount={outputAmount}
          title="To"
          isLoading={isLoadingTrade}
        />
      </div>
      <SubmitSwap />
    </FormContainer>
  );
}

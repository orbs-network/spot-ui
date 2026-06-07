"use client";

import { useCallback, useMemo, useState } from "react";
import BN from "bignumber.js";
import { type Step, SwapStatus as HubSwapStatus } from "@orbs-network/swap-ui";
import { WalletButton } from "@rainbow-me/rainbowkit";
import { CurrencyLogo } from "@/components/ui/currency-logo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useActiveConnection } from "@/lib/hooks/use-active-connection";
import { useBalance } from "@/lib/hooks/use-balances";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useBestTradeSwapStore } from "@/lib/hooks/store";
import { useSwapBestTrade } from "@/lib/hooks/use-swap-best-trade";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { useUtilaConnectRetry } from "@/lib/hooks/use-utila-connect-retry";
import { useUSDPrice } from "@/lib/hooks/use-usd-price";
import { SwapStep } from "@/lib/types";
import { formatDecimals, getExplorerUrl, toAmountUI } from "@/lib/utils";
import {
  getUtilaCompletedResultSteps,
  getUtilaFailedResultSteps,
  UTILA_WALLET_FOOTER_TEXT,
  type UtilaCompletedStep,
  UtilaStepResultsCard,
  UtilaStepProgress,
} from "./shared";

const useUtilaSwapButtonState = () => {
  const { address } = useActiveConnection();
  const {
    inputCurrency: inputCurrencyAddress,
    outputCurrency: outputCurrencyAddress,
  } = useSwapParams();
  const inputTokenSelected = Boolean(inputCurrencyAddress);
  const outputTokenSelected = Boolean(outputCurrencyAddress);
  const {
    inputCurrency,
    isLoadingTrade,
    outputCurrency,
    parsedInputAmount,
    trade,
  } = useDerivedSwap();
  const { wei: inputBalance } = useBalance(inputCurrency);
  const hasAmount = BN(parsedInputAmount || "0").gt(0);
  const enterAmount = !hasAmount;
  const insufficientBalance =
    Boolean(inputCurrency) &&
    hasAmount &&
    BN(inputBalance || "0").lt(parsedInputAmount || "0");
  const insufficientLiquidity =
    Boolean(inputCurrency && outputCurrency) &&
    hasAmount &&
    !isLoadingTrade &&
    BN(trade?.outAmount || "0").isZero();
  const missingToken =
    !inputCurrency ||
    !outputCurrency ||
    !inputTokenSelected ||
    !outputTokenSelected;
  const text = useMemo(() => {
    if (!address) return "Connect Wallet";
    if (missingToken) return "Select token";
    if (enterAmount) return "Enter an amount";
    if (isLoadingTrade) return "Fetching quote...";
    if (insufficientBalance) {
      return `Insufficient ${inputCurrency?.symbol || "token"} balance`;
    }
    if (insufficientLiquidity) return "Insufficient liquidity";

    return "Swap";
  }, [
    address,
    enterAmount,
    inputCurrency?.symbol,
    insufficientBalance,
    insufficientLiquidity,
    isLoadingTrade,
    missingToken,
  ]);
  const disabled =
    Boolean(address) &&
    (missingToken ||
      enterAmount ||
      isLoadingTrade ||
      insufficientBalance ||
      insufficientLiquidity);

  return {
    disabled,
    insufficientBalance,
    insufficientLiquidity,
    text,
  };
};

export const UtilaSwapValidationError = () => {
  const { inputCurrency } = useDerivedSwap();
  const { insufficientBalance, insufficientLiquidity } =
    useUtilaSwapButtonState();
  const message = insufficientBalance
    ? `Insufficient ${inputCurrency?.symbol || "token"} balance`
    : insufficientLiquidity
      ? "Insufficient liquidity"
      : "";

  if (!message) return null;

  return (
    <div className="flex h-8 items-center gap-2 rounded-[6px] bg-[#fee8ea] px-3 text-[#3f4361]">
      <span className="flex size-3 shrink-0 items-center justify-center rounded-full bg-[#f0445a] text-[9px] font-bold leading-none text-white">
        !
      </span>
      <p className="flex-1 text-[14px] font-normal leading-4">{message}</p>
    </div>
  );
};

const useUtilaSwapStep = () => {
  const { currentStep } = useBestTradeSwapStore();

  return useMemo((): Step | undefined => {
    if (currentStep === SwapStep.WRAP) {
      return {
        footerText: UTILA_WALLET_FOOTER_TEXT,
        title: "Wrap",
      };
    }

    if (currentStep === SwapStep.APPROVE) {
      return {
        footerText: UTILA_WALLET_FOOTER_TEXT,
        title: "Approve",
      };
    }

    if (currentStep === SwapStep.SIGN) {
      return {
        footerText: "Sign the swap request in the Utila mobile app.",
        title: "Sign",
      };
    }

    if (currentStep === SwapStep.SWAP) {
      return {
        footerText: "Submitting the signed swap to Liquidity Hub.",
        title: "Swap",
      };
    }

    return undefined;
  }, [currentStep]);
};

const UtilaSwapSummary = () => {
  const { inputAmount, inputCurrency, outputAmount, outputCurrency } =
    useDerivedSwap();
  const inputUsd = useUSDPrice({
    amount: inputAmount,
    disabled: !inputCurrency || BN(inputAmount || "0").lte(0),
    token: inputCurrency?.address,
  });
  const outputUsd = useUSDPrice({
    amount: outputAmount,
    disabled: !outputCurrency || BN(outputAmount || "0").lte(0),
    token: outputCurrency?.address,
  });

  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-[#e3e5eb] bg-[#fbfbfd] p-3">
      {[
        {
          amount: inputAmount,
          currency: inputCurrency,
          label: "From",
          usd: inputUsd.formatted,
        },
        {
          amount: outputAmount,
          currency: outputCurrency,
          label: "To",
          usd: outputUsd.formatted,
        },
      ].map((row) => (
        <div
          className="flex items-center justify-between gap-4"
          key={row.label}
        >
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[#70748d]">
              {row.label}
            </p>
            <p className="mt-1 truncate text-[15px] font-semibold text-[#3f4361]">
              {formatDecimals(row.amount || "0", 6)} {row.currency?.symbol}
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-[#70748d]">
              ≈ ${row.usd || "0"}
            </p>
          </div>
          <CurrencyLogo className="size-8 shrink-0" currency={row.currency} />
        </div>
      ))}
    </div>
  );
};

const UtilaSwapDetailRow = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="flex min-h-8 items-center justify-between gap-4 border-b border-[#eceef3] py-2 last:border-b-0">
    <p className="text-[13px] font-medium text-[#70748d]">{label}</p>
    <p className="min-w-0 truncate text-right text-[13px] font-semibold text-[#3f4361]">
      {value}
    </p>
  </div>
);

const UtilaSwapDetails = () => {
  const { inputAmount, inputCurrency, outputAmount, outputCurrency, trade } =
    useDerivedSwap();
  const networkCostAmount = toAmountUI(trade?.gas, outputCurrency?.decimals);
  const minimumAmountOut = toAmountUI(
    trade?.minAmountOut,
    outputCurrency?.decimals,
  );
  const networkCostUsd = useUSDPrice({
    amount: networkCostAmount,
    disabled: !outputCurrency || BN(networkCostAmount || "0").lte(0),
    token: outputCurrency?.address,
  });
  const inputUsd = useUSDPrice({
    amount: inputAmount,
    disabled: !inputCurrency || BN(inputAmount || "0").lte(0),
    token: inputCurrency?.address,
  });
  const outputUsd = useUSDPrice({
    amount: outputAmount,
    disabled: !outputCurrency || BN(outputAmount || "0").lte(0),
    token: outputCurrency?.address,
  });
  const rate =
    BN(inputAmount || "0").gt(0) && BN(outputAmount || "0").gt(0)
      ? BN(outputAmount).div(inputAmount).toString()
      : "";
  const priceImpact =
    BN(inputUsd.data || 0).gt(0) && BN(outputUsd.data || 0).gt(0)
      ? BN(100).minus(BN(outputUsd.data).div(inputUsd.data).times(100))
      : undefined;

  if (!trade || !inputCurrency || !outputCurrency) return null;

  return (
    <div className="rounded-[8px] border border-[#e3e5eb] bg-white px-3">
      <UtilaSwapDetailRow
        label="Rate"
        value={
          rate
            ? `1 ${inputCurrency.symbol} = ${formatDecimals(rate, 6)} ${
                outputCurrency.symbol
              }`
            : "-"
        }
      />
      <UtilaSwapDetailRow
        label="Minimum amount out"
        value={`${formatDecimals(minimumAmountOut, 6)} ${outputCurrency.symbol}`}
      />
      <UtilaSwapDetailRow
        label="Network cost"
        value={`$${networkCostUsd.formatted || "0"}`}
      />
      <UtilaSwapDetailRow
        label="Price impact"
        value={
          priceImpact ? `${formatDecimals(priceImpact.toString(), 2)}%` : "-"
        }
      />
    </div>
  );
};

export const UtilaSubmitSwap = () => {
  const { setInputAmount } = useActionHandlers();
  const { address, chainId } = useActiveConnection();
  const { retryingConnect, startConnectRetry } = useUtilaConnectRetry();
  const { disabled, text } = useUtilaSwapButtonState();
  const {
    currentStepIndex,
    onSwapBestTrade,
    reset,
    status,
    steps,
    totalSteps,
    txHash,
  } = useSwapBestTrade();
  const currentStep = useUtilaSwapStep();
  const [open, setOpen] = useState(false);
  const completedSteps = useMemo((): UtilaCompletedStep[] => {
    const completedSwapSteps = steps?.length ? steps : [SwapStep.SWAP];

    return completedSwapSteps.map((step) => {
      if (step === SwapStep.WRAP) {
        return {
          title: "Wrap",
        };
      }

      if (step === SwapStep.APPROVE) {
        return {
          title: "Approve",
        };
      }

      if (step === SwapStep.SIGN) {
        return {
          title: "Sign",
        };
      }

      return {
        footerLink: txHash ? getExplorerUrl(chainId, txHash) : undefined,
        footerText: txHash ? "View on explorer" : undefined,
        title: "Swap",
      };
    });
  }, [chainId, steps, txHash]);
  const terminalSteps = useMemo(() => {
    if (status === HubSwapStatus.FAILED) {
      return getUtilaFailedResultSteps({
        failedStepIndex: currentStepIndex,
        message: "Swap failed",
        steps: completedSteps,
      });
    }

    return getUtilaCompletedResultSteps(completedSteps).map((step) => ({
      ...step,
      footerText: step.footerText || "Completed",
    }));
  }, [completedSteps, currentStepIndex, status]);

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);

      if (nextOpen) return;

      if (status === HubSwapStatus.SUCCESS) {
        setInputAmount("");
      }

      if (status) {
        setTimeout(reset, 500);
      }
    },
    [reset, setInputAmount, status],
  );
  const onButtonClick = useCallback(() => {
    setOpen(true);
    if (status !== HubSwapStatus.LOADING) {
      reset();
    }
  }, [reset, status]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <WalletButton.Custom wallet="utila">
        {({ connect, loading: connectLoading, mounted, ready }) => (
          <button
            className="mt-2 flex h-10 w-full items-center justify-center rounded-[8px] bg-[#cfd0d8] px-4 text-[16px] font-normal text-white transition-colors enabled:bg-[#4564ff] enabled:hover:bg-[#3152ff]"
            disabled={
              address
                ? disabled
                : !mounted || !ready || connectLoading || retryingConnect
            }
            onClick={() => {
              if (!address) {
                startConnectRetry(connect);
                return;
              }

              onButtonClick();
            }}
            type="button"
          >
            {!address && (connectLoading || retryingConnect)
              ? "Connecting..."
              : text}
            {(status === HubSwapStatus.LOADING ||
              (!address && (connectLoading || retryingConnect))) && (
              <Spinner className="size-4" />
            )}
          </button>
        )}
      </WalletButton.Custom>
      <DialogContent className="max-w-[520px] border-[#e3e5eb] bg-white text-[#3f4361]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-[#3f4361]">
            Review Swap
          </DialogTitle>
        </DialogHeader>
        {status === HubSwapStatus.SUCCESS ? (
          <div className="flex flex-col gap-4">
            <UtilaSwapSummary />
            <UtilaStepResultsCard steps={terminalSteps} />
            <button
              className="h-10 cursor-pointer rounded-[8px] bg-[#4564ff] text-[15px] font-semibold text-white transition-colors hover:bg-[#3152ff]"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              Close
            </button>
          </div>
        ) : status === HubSwapStatus.FAILED ? (
          <div className="flex flex-col gap-4">
            <UtilaSwapSummary />
            <UtilaStepResultsCard steps={terminalSteps} />
            <button
              className="h-10 cursor-pointer rounded-[8px] bg-[#4564ff] text-[15px] font-semibold text-white transition-colors hover:bg-[#3152ff]"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <UtilaSwapSummary />
            <UtilaSwapDetails />
            <UtilaStepProgress
              currentStep={currentStep}
              currentStepIndex={currentStepIndex}
              fallbackFooterText="Checking quote, balance, and allowance."
              fallbackTitle="Preparing swap"
              isLoading={status === HubSwapStatus.LOADING}
              totalSteps={totalSteps}
            />
            <button
              className="flex h-11 w-full items-center justify-center rounded-[8px] bg-[#4564ff] text-[16px] font-semibold text-white disabled:bg-[#c9ccd6]"
              disabled={status === HubSwapStatus.LOADING}
              onClick={() => onSwapBestTrade()}
              type="button"
            >
              {status === HubSwapStatus.LOADING
                ? "Swapping..."
                : "Confirm Swap"}
              {status === HubSwapStatus.LOADING && (
                <Spinner className="size-4" />
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

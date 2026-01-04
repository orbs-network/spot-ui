import { isFreshQuote, permit2Address, Quote,  } from "@orbs-network/liquidity-hub-sdk";
import { useMutation } from "@tanstack/react-query";
import { useSignEip } from "./use-sign-eip";
import { useApproval } from "./use-approval";
import { useWrap } from "./use-wrap";
import { getExplorerUrl, isNativeAddress } from "../utils";
import { useDerivedSwap } from "./use-derived-swap";
import BN from "bignumber.js";
import { useLiquidityHub } from "./liquidity-hub";
import { useGetTransactionReceiptCallback } from "./use-get-transaction-receipt";
import { useBestTradeSwapStore, useSwapStore } from "./store";
import { SwapStatus } from "@orbs-network/swap-ui";
import { SwapStep } from "../types";
import { toast } from "sonner";
import { useBalances } from "./use-balances";
import { useCallback, useRef } from "react";
import TokensPair from "@/components/tokens-pair";
import { useConnection } from "wagmi";

const usePrepareQuote = () => {
  const { trade, refetchTrade } = useDerivedSwap();

  return useMutation({
    mutationFn: async () => {
      if (!trade) {
        throw new Error("Quote not found");
      }
      const originalQuote = trade.originalQuote as Quote;
      
      if (isFreshQuote(originalQuote, 60)) {
        return originalQuote;
      }
      const freshQuote = (await refetchTrade())?.data?.originalQuote as Quote | undefined;
      if (!freshQuote) {
        return originalQuote;
      }
      if (BN(freshQuote.minAmountOut).lt(BN(originalQuote.minAmountOut))) {
        return originalQuote;
      }
      return freshQuote;
    },
  });
};

const getTotalSteps = (shouldWrap: boolean, shouldApprove: boolean) => {
  let totalSteps = 1;
  if (shouldWrap) {
    totalSteps++;
  }
  if (shouldApprove) {
    totalSteps++;
  }
  return totalSteps;
};

const useToasts = () => {
  const wrapToastId = useRef<number>(null);
  const approveToastId = useRef<number>(null);
  const swapToastId = useRef<number>(null);
  const { inputCurrency, outputCurrency } = useDerivedSwap();
  const { chainId } = useConnection();
  const { txHash } = useBestTradeSwapStore();
  const onWrapRequest = useCallback(() => {
    wrapToastId.current = toast.loading(
      `Wrapping ${inputCurrency?.symbol}...`
    ) as number;
  }, [inputCurrency?.symbol]);

  const onWrapSuccess = useCallback(() => {
    toast.success(`Wrapped ${inputCurrency?.symbol}`, {
      id: wrapToastId.current as number,
    });
  }, [inputCurrency?.symbol]);

  const onApproveRequest = useCallback(() => {
    approveToastId.current = toast.loading(
      `Approving ${inputCurrency?.symbol}...`
    ) as number;
  }, [inputCurrency?.symbol]);

  const onApproveSuccess = useCallback(() => {
    toast.success(`Approved ${inputCurrency?.symbol}`, {
      id: approveToastId.current as number,
    });
  }, [inputCurrency?.symbol]);

  const onSwapRequest = useCallback(() => {
    swapToastId.current = toast.loading(
      <TokensPair
        prefix="Swapping"
        srcTokenAddress={inputCurrency?.address}
        dstTokenAddress={outputCurrency?.address}
      />
    ) as number;
  }, [inputCurrency?.address, outputCurrency?.address]);

  const onSwapSuccess = useCallback(() => {
    toast.success(
      <TokensPair
        prefix="Swap completed"
        srcTokenAddress={inputCurrency?.address}
        dstTokenAddress={outputCurrency?.address}
      />,
      {
        id: swapToastId.current as number,
        description: (
          <a
            href={getExplorerUrl(chainId, txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            View on explorer
          </a>
        ),
        duration: 20_000,
        closeButton: true,
      }
    );
  }, [inputCurrency?.address, outputCurrency?.address, chainId, txHash]);

  const onSwapFailed = useCallback(() => {
    toast.error("Swap failed", { id: swapToastId.current as number });
  }, []);

  const onTransactionRejected = useCallback(() => {
    toast.error("Transaction rejected", { id: swapToastId.current as number });
  }, []);

  return {
    onWrapRequest,
    onApproveRequest,
    onSwapRequest,
    onSwapSuccess,
    onApproveSuccess,
    onWrapSuccess,
    onSwapFailed,
    onTransactionRejected,
  };
};

export const useSwapBestTrade = () => {
  const { mutateAsync: prepareQuote } = usePrepareQuote();
  const {
    status,
    updateStore,
    totalSteps,
    currentStepIndex,
    resetStore,
    txHash,
  } = useBestTradeSwapStore();

  const { mutateAsync: signEip } = useSignEip();
  const { parsedInputAmount, inputCurrency, outputCurrency } = useDerivedSwap();
  const liquidityHubClient = useLiquidityHub();
  const { setPauseQuote } = useSwapStore();
  const { refetch: refetchBalances } = useBalances();
  const { mutateAsync: getTransactionReceiptCallback } =
    useGetTransactionReceiptCallback();
  const { ensureAllowance, approve } = useApproval(
    permit2Address,
    inputCurrency?.address,
    parsedInputAmount
  );
  const { mutateAsync: wrap } = useWrap();
  const toasts = useToasts();

  const { mutateAsync: swapBestTrade } = useMutation({
    mutationFn: async () => {
      if (!inputCurrency || !outputCurrency) {
        throw new Error("Input or output currency not found");
      }
      resetStore();
      let currentStepIndex = 0;
      updateStore({ status: SwapStatus.LOADING, currentStepIndex });
      setPauseQuote(true);

      const isNativeIn = isNativeAddress(inputCurrency.address);

      const hasAllowance = await ensureAllowance();
      updateStore({ totalSteps: getTotalSteps(isNativeIn, !hasAllowance) });

      if (isNativeIn) {
        updateStore({ currentStep: SwapStep.WRAP });

        await wrap(parsedInputAmount);
        toasts.onWrapSuccess();
        currentStepIndex++;
        updateStore({ currentStepIndex });
      }

      if (!hasAllowance) {
        updateStore({ currentStep: SwapStep.APPROVE });
        toasts.onApproveRequest();
        await approve();
        toasts.onApproveSuccess();
        currentStepIndex++;
        updateStore({ currentStepIndex });
      }

      updateStore({ currentStep: SwapStep.SWAP });
      const quote = await prepareQuote();
      toasts.onSwapRequest();
      const signature = await signEip(quote);
      const tx = await liquidityHubClient.swap(quote, signature);
      toasts.onSwapSuccess();
      updateStore({ txHash: tx as `0x${string}` });
      const test = await liquidityHubClient.getTransactionDetails(tx as `0x${string}`, quote);
      console.log({test});
      
      return await getTransactionReceiptCallback(tx as `0x${string}`);
    },
    onSuccess: () => {
      toasts.onSwapSuccess();
      updateStore({ status: SwapStatus.SUCCESS });
    },
    onError: (error) => {
      console.error(error);
    
      if (error instanceof Error && error.message.includes("rejected")) {
        toasts.onTransactionRejected();
        updateStore({ status: undefined });
      } else {
        updateStore({ status: SwapStatus.FAILED });
        toasts.onSwapFailed();
      }
    },
    onSettled: () => {
      setPauseQuote(false);
      refetchBalances();
    },
  });

  return {
    onSwapBestTrade: swapBestTrade,
    status,
    totalSteps,
    currentStepIndex,
    txHash,
    reset: resetStore,
  };
};

import { SwapStatus } from "../types";
import BN from "bignumber.js";
import {
  analytics,
  isNativeAddress,
  IWETH_ABI,
  submitOrder,
} from "@orbs-network/spot-ui";
import { ParsedError, Steps, Token } from "../types";
import {
  ensureWrappedToken,
  getExplorerUrl,
  isTxRejected,
  toAmountUi,
} from "../utils";
import { useSrcAmount } from "./use-src-amount";
import { useMutation } from "@tanstack/react-query";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useSwapExecution } from "./use-swap-execution";

import { erc20Abi, maxUint256, numberToHex, parseSignature } from "viem";
import { useOrdersQuery } from "./order-hooks";
import { useNetwork } from "./helper-hooks";
import { useGetTransactionReceipt } from "./use-get-transaction-receipt";
import { useTriggerPrice } from "./use-trigger-price";
import { useTrades } from "./use-trades";
import { useDeadline } from "./use-deadline";
import { useFillDelay } from "./use-fill-delay";
import { useDstMinAmountPerTrade } from "./use-dst-amount";
import { useRePermitOrderData } from "./use-repermit-order-data";

const useWrapToken = () => {
  const {
    account,
    walletClient,
    overrides,
    callbacks,
    chainId,
  } = useSpotContext();
  const wToken = useNetwork()?.wToken;
  const getTransactionReceipt = useGetTransactionReceipt();

  return useMutation({
    mutationFn: async ({
      onHash,
      srcAmountWei,
    }: {
      onHash?: (hash: string) => void;
      srcAmountWei: string;
    }) => {
      if (!account) {
        throw new Error("missing account");
      }
      if (!walletClient) {
        throw new Error("missing walletClient");
      }
      if (!wToken) {
        throw new Error("tokenAddress is not defined");
      }

      let hash: `0x${string}` | undefined;
      analytics.onWrapRequest();
      if (overrides?.wrap) {
        hash = await overrides.wrap(srcAmountWei);
      } else {
        hash = await walletClient.writeContract({
          abi: IWETH_ABI,
          functionName: "deposit",
          account,
          address: wToken.address as `0x${string}`,
          value: BigInt(srcAmountWei),
          chain: walletClient.chain,
        });
      }
      callbacks?.onWrapRequest?.();

      onHash?.(hash);
      const receipt = await getTransactionReceipt(hash);
      if (!receipt) {
        throw new Error("failed to get transaction receipt");
      }

      if (receipt.status === "reverted") {
        throw new Error("failed to wrap token");
      }
      analytics.onWrapSuccess(hash);
      callbacks?.onWrapSuccess?.({
        txHash: receipt.transactionHash,
        explorerUrl: getExplorerUrl(receipt.transactionHash, chainId),
        amount: toAmountUi(srcAmountWei, wToken.decimals),
      });
      return receipt;
    },
    onError: (error) => {
      analytics.onWrapError(error);
      throw error;
    },
  });
};

export const useSignOrder = () => {
  const { account, walletClient, chainId, callbacks } = useSpotContext();
  const rePermitData = useRePermitOrderData();
  const { refetch: refetchOrders } = useOrdersQuery();

  return useMutation({
    mutationFn: async () => {
      if (!account) {
        throw new Error("missing account");
      }
      if (!walletClient) {
        throw new Error("missing walletClient");
      }
      if (!chainId) {
        throw new Error("missing chainId");
      }

      const { order, domain, types, primaryType } = rePermitData;

      analytics.onSignOrderRequest(order);
      let signatureStr: `0x${string}`;
      try {
        signatureStr = await walletClient?.signTypedData({
          domain: domain as Record<string, any>,
          types,
          primaryType,
          message: order as Record<string, any>,
          account: account as `0x${string}`,
        });
      } catch (error) {
        callbacks?.onSignOrderError?.(error as Error);
        analytics.onSignOrderError(error);
        throw error;
      }

      analytics.onSignOrderSuccess(signatureStr);
      callbacks?.onSignOrderSuccess?.(signatureStr);
      const parsedSignature = parseSignature(signatureStr);
      const signature = {
        v: numberToHex(parsedSignature.v || 0),
        r: parsedSignature.r,
        s: parsedSignature.s,
      };
      callbacks?.onSignOrderRequest?.();

      const newOrder = await submitOrder(order, signature);
      callbacks?.onOrderCreated?.(newOrder);
      await refetchOrders();
      return newOrder;
    },
  });
};

const useHasAllowanceCallback = () => {
  const { account, publicClient, config } = useSpotContext();

  return useMutation({
    mutationFn: async ({
      tokenAddress,
      srcAmountWei,
    }: {
      tokenAddress: string;
      srcAmountWei: string;
    }) => {
      if (!publicClient) {
        throw new Error("missing publicClient");
      }
      if (!account) {
        throw new Error("missing account");
      }
      if (!config) {
        throw new Error("missing config");
      }

      const allowance = await publicClient
        .readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account as `0x${string}`, config.repermit],
        })
        .then((res) => res.toString());

      const approvalRequired = BN(allowance || "0").lt(
        BN(srcAmountWei).toString(),
      );

      return { allowance, approvalRequired };
    },
  });
};

const useApproveToken = () => {
  const { account, walletClient, overrides, config, chainId, callbacks } =
    useSpotContext();
  const getTransactionReceipt = useGetTransactionReceipt();
  const { mutateAsync: hasAllowanceCallback } = useHasAllowanceCallback();

  return useMutation({
    onError: (error) => {
      analytics.onApproveError(error);
    },
    mutationFn: async ({
      token,
      onHash,
      srcAmountWei,
    }: {
      token: Token;
      onHash: (hash: string) => void;
      srcAmountWei: string;
    }) => {
      if (!account) {
        throw new Error("missing account");
      }
      if (!walletClient) {
        throw new Error("missing walletClient");
      }
      if (!config) {
        throw new Error("missing config");
      }

      analytics.onApproveRequest();
      let hash: `0x${string}` | undefined;
      if (overrides?.approveOrder) {
        hash = await overrides.approveOrder({
          tokenAddress: token.address,
          spenderAddress: config.repermit,
          amount: maxUint256,
        });
      } else {
        hash = await walletClient.writeContract({
          abi: erc20Abi,
          functionName: "approve",
          account: account as `0x${string}`,
          address: token.address as `0x${string}`,
          args: [config.repermit, maxUint256],
          chain: walletClient.chain,
        });
      }
      if (!hash) {
        throw new Error("failed to approve token");
      }
      callbacks?.onApproveRequest?.();
      onHash(hash);
      const receipt = await getTransactionReceipt(hash);
      if (!receipt) {
        throw new Error("failed to get transaction receipt");
      }

      if (receipt.status === "reverted") {
        throw new Error("failed to approve token");
      }

      let userApprovedSuccessfully = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { approvalRequired } = await hasAllowanceCallback({
          tokenAddress: token.address,
          srcAmountWei,
        });

        if (!approvalRequired) {
          userApprovedSuccessfully = true;
          break;
        }
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 3000)); // 3s delay
        }
      }

      if (!userApprovedSuccessfully) {
        throw new Error(
          `Insufficient ${token.symbol} allowance to perform the swap. Please approve the token first.`,
        );
      }

      analytics.onApproveSuccess(receipt.transactionHash);
      callbacks?.onApproveSuccess?.({
        txHash: receipt.transactionHash,
        explorerUrl: getExplorerUrl(receipt.transactionHash, chainId),
        token: token,
        amount: toAmountUi(srcAmountWei, token.decimals),
      });
      return receipt;
    },
  });
};

const useInitOrderRequest = () => {
  const { account, chainId, srcToken, dstToken, module, slippage } =
    useSpotContext();
  const triggerPrice = useTriggerPrice();
  const srcAmount = useSrcAmount().amount;
  const srcChunkAmount = useTrades().amountPerTrade;
  const deadlineMillis = useDeadline();
  const chunksAmount = useTrades().totalTrades;
  const fillDelay = useFillDelay().fillDelay;
  const dstMinAmountPerTrade = useDstMinAmountPerTrade().amount;
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);

  return useMutation({
    mutationFn: async () => {
      analytics.onRequestOrder({
        account: account as `0x${string}`,
        chainId: chainId as number,
        module,
        srcToken: srcToken as Token,
        dstToken: dstToken as Token,
        fromTokenAmount: srcAmount as string,
        srcChunkAmount: srcChunkAmount as string,
        triggerPricePerTrade: triggerPrice.pricePerChunk as string,
        deadline: deadlineMillis as number,
        fillDelay: fillDelay.unit * fillDelay.value,
        minDstAmountOutPerTrade: dstMinAmountPerTrade as string,
        slippage,
        isMarketOrder: isMarketOrder || false,
        chunksAmount,
      });
    },
  });
};

function parseError(error: Error): ParsedError {
  const input = error.message;
  const codeMatch = input.match(/,\s*code\s*:\s*(\d+)/i);

  const errorStr = input
    .replace(/^error\s*:/i, "")
    .replace(/,\s*code\s*:\s*\d+/i, "")
    .trim();

  return {
    message: errorStr || "",
    code: codeMatch ? Number(codeMatch[1]) : 0,
  };
}

export const useSubmitOrderMutation = () => {
  const { srcToken, dstToken, chainId, callbacks, marketPrice } = useSpotContext();
  const approveCallback = useApproveToken().mutateAsync;
  const wrapCallback = useWrapToken().mutateAsync;
  const createOrderCallback = useSignOrder().mutateAsync;
  const { mutateAsync: hasAllowanceCallback } = useHasAllowanceCallback();
  const { update: updateSwapExecution } = useSwapExecution();
  const { amount: srcAmountWei } = useSrcAmount();
  const initOrderRequest = useInitOrderRequest().mutate;

  return useMutation({
    mutationFn: async () => {
      const wrapRequired = isNativeAddress(srcToken?.address || " ");

      try {
        if (!srcToken) {
          throw new Error("missing srcToken");
        }
        if (!dstToken) {
          throw new Error("missing dstToken");
        }
        if (!chainId) {
          throw new Error("missing chainId");
        }
        const srcWrappedToken = ensureWrappedToken(srcToken, chainId);
        updateSwapExecution({
          allowanceLoading: true,
          wrapTxHash: undefined,
          approveTxHash: undefined,
          acceptedMarketPrice: marketPrice,
          acceptedSrcAmount: srcAmountWei,
          srcToken,
          dstToken,
          pendingSteps: [],
        });
        const { approvalRequired } = await hasAllowanceCallback({
          tokenAddress: srcWrappedToken.address,
          srcAmountWei,
        });
        let stepIndex = 0;
        let totalSteps = 1;
        if (wrapRequired) totalSteps++;
        if (approvalRequired) totalSteps++;
        updateSwapExecution({
          totalSteps,
          stepIndex,
          allowanceLoading: false,
          hasApproval: !approvalRequired,
          status: SwapStatus.LOADING,
        });
        initOrderRequest();

        let pendingSteps: Steps[] = [];

        if(wrapRequired) {
          pendingSteps.push(Steps.WRAP);
        }
        if(approvalRequired) {
          pendingSteps.push(Steps.APPROVE);
        }
        pendingSteps.push(Steps.CREATE);
        updateSwapExecution({ pendingSteps });
        if (wrapRequired) {
          updateSwapExecution({ step: Steps.WRAP });
          await wrapCallback({
            onHash: (wrapTxHash) => updateSwapExecution({ wrapTxHash }),
            srcAmountWei,
          });
          stepIndex++;
          updateSwapExecution({ stepIndex });
        }

        if (approvalRequired) {
          updateSwapExecution({ step: Steps.APPROVE });

          await approveCallback({
            token: srcWrappedToken,
            onHash: (approveTxHash) => updateSwapExecution({ approveTxHash }),
            srcAmountWei,
          });
          stepIndex++;
          updateSwapExecution({ stepIndex });
        }
        updateSwapExecution({ step: Steps.CREATE });
        const order = await createOrderCallback();

        updateSwapExecution({ status: SwapStatus.SUCCESS, orderId: order.id });
        return order;
      } catch (error) {
        if (isTxRejected(error)) {
          callbacks?.onSubmitOrderRejected?.();
          updateSwapExecution({
            step: undefined,
            status: undefined,
            stepIndex: undefined,
            error: error as Error,
          });
        } else {
          const parsedError = parseError(error as Error);
          callbacks?.onSubmitOrderFailed?.(parsedError);
          updateSwapExecution({
            status: SwapStatus.FAILED,
            parsedError,
            error: error as Error,
          });
        }
        throw error;
      }
    },
  });
};

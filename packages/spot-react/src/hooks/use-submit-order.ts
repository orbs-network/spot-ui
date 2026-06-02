import { SwapStatus } from "../types";
import BN from "bignumber.js";
import {
  analytics,
  isNativeAddress,
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

import { useOrdersQuery } from "./order-hooks";
import { useNetwork } from "./helper-hooks";
import { useTriggerPrice } from "./use-trigger-price";
import { useTrades } from "./use-trades";
import { useDeadline } from "./use-deadline";
import { useFillDelay } from "./use-fill-delay";
import { useDstMinAmountPerTrade } from "./use-dst-amount";
import { useRePermitOrderData } from "./use-repermit-order-data";

function parseSignatureBytes(sig: `0x${string}`) {
  const raw = sig.slice(2);
  if (raw.length === 128) {
    // EIP-2098 compact signature (64 bytes): recover v from s high bit
    const r = `0x${raw.slice(0, 64)}` as `0x${string}`;
    const sHigh = parseInt(raw.charAt(64), 16);
    const v = (sHigh >> 3) + 27;
    const s = `0x${(sHigh & 0x7).toString(16)}${raw.slice(65, 128)}` as `0x${string}`;
    return { r, s, v };
  }
  // Standard 65-byte signature
  const r = `0x${raw.slice(0, 64)}` as `0x${string}`;
  const s = `0x${raw.slice(64, 128)}` as `0x${string}`;
  const v = parseInt(raw.slice(128, 130), 16);
  return { r, s, v };
}

const useWrapToken = () => {
  const { account, walletInteractions, callbacks, chainId } = useSpotContext();
  const wToken = useNetwork()?.wToken;

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
      if (!walletInteractions) {
        throw new Error("missing walletInteractions");
      }
      if (!wToken) {
        throw new Error("tokenAddress is not defined");
      }

      analytics.onWrapRequest();
      const hash = await walletInteractions.wrapNativeToken(srcAmountWei);
      callbacks?.onWrapRequest?.();

      onHash?.(hash);
      analytics.onWrapSuccess(hash);
      callbacks?.onWrapSuccess?.({
        txHash: hash,
        explorerUrl: getExplorerUrl(hash, chainId),
        amount: toAmountUi(srcAmountWei, wToken.decimals),
      });
      return hash;
    },
    onError: (error) => {
      analytics.onWrapError(error);
      throw error;
    },
  });
};

export const useSignOrder = () => {
  const { account, walletInteractions, chainId, callbacks, isDev } =
    useSpotContext();
  const rePermitData = useRePermitOrderData();
  const { refetch: refetchOrders } = useOrdersQuery();

  return useMutation({
    mutationFn: async () => {
      if (!account) {
        throw new Error("missing account");
      }
      if (!walletInteractions) {
        throw new Error("missing walletInteractions");
      }
      if (!chainId) {
        throw new Error("missing chainId");
      }

      const { order, domain, types, primaryType } = rePermitData;

      analytics.onSignOrderRequest(order);
      let signatureStr: `0x${string}`;
      try {
        signatureStr = await walletInteractions.signOrder({
          domain: domain as Record<string, unknown>,
          types: types as Record<string, unknown[]>,
          primaryType,
          message: order as unknown as Record<string, unknown>,
          account: account as `0x${string}`,
        });
      } catch (error) {
        callbacks?.onSignOrderError?.(error as Error);
        analytics.onSignOrderError(error);
        throw error;
      }

      analytics.onSignOrderSuccess(signatureStr);
      callbacks?.onSignOrderSuccess?.(signatureStr);
      const parsedSignature = parseSignatureBytes(signatureStr);
      const signature = {
        v: `0x${parsedSignature.v.toString(16)}` as `0x${string}`,
        r: parsedSignature.r,
        s: parsedSignature.s,
      };
      callbacks?.onSignOrderRequest?.();

      const newOrder = await submitOrder(order, signature, isDev);
      callbacks?.onOrderCreated?.(newOrder);
      await refetchOrders();
      return newOrder;
    },
  });
};

const useHasAllowanceCallback = () => {
  const { account, walletInteractions, config } = useSpotContext();

  return useMutation({
    mutationFn: async ({
      tokenAddress,
      srcAmountWei,
    }: {
      tokenAddress: string;
      srcAmountWei: string;
    }) => {
      if (!walletInteractions) {
        throw new Error("missing walletInteractions");
      }
      if (!account) {
        throw new Error("missing account");
      }
      if (!config) {
        throw new Error("missing config");
      }

      const allowance = await walletInteractions
        .getAllowance({
          tokenAddress: tokenAddress,
          spenderAddress: config.repermit,
        });

      const approvalRequired = BN(allowance || "0").lt(
        BN(srcAmountWei).toString(),
      );

      return { allowance, approvalRequired };
    },
  });
};

const useApproveToken = () => {
  const { account, walletInteractions, config, chainId, callbacks } =
    useSpotContext();
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
      if (!walletInteractions) {
        throw new Error("missing walletInteractions");
      }
      if (!config) {
        throw new Error("missing config");
      }

      analytics.onApproveRequest();
      const hash = await walletInteractions.approveToken({
        tokenAddress: token.address,
        amount: srcAmountWei,
        spenderAddress: config.repermit,
      });
      if (!hash) {
        throw new Error("failed to approve token");
      }
      callbacks?.onApproveRequest?.();
      onHash(hash);

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

      analytics.onApproveSuccess(hash);
      callbacks?.onApproveSuccess?.({
        txHash: hash,
        explorerUrl: getExplorerUrl(hash, chainId),
        token: token,
        amount: toAmountUi(srcAmountWei, token.decimals),
      });
      return hash;
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
  const { srcToken, dstToken, chainId, callbacks, marketPrice } =
    useSpotContext();
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

        if (wrapRequired) {
          pendingSteps.push(Steps.WRAP);
        }
        if (approvalRequired) {
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

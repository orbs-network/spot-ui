/* eslint-disable @typescript-eslint/no-explicit-any */
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { getWrappedNativeCurrency } from "@/lib/utils";
import {
  isNativeAddress,
  OnApproveSuccessCallback,
  OnCancelOrderSuccess,
  OnWrapSuccessCallback,
  ParsedError,
  Token,
  Order,
  type WalletInteractions,
  type SignOrderProps,
  type CancelOrderProps,
  type ApproveTokenProps,
  type GetAllowanceProps,
} from "@orbs-network/spot-react";
import { erc20Abi } from "viem";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useConnection, usePublicClient, useWalletClient } from "wagmi";

import TokensPair from "@/components/tokens-pair";
import { useCurrency } from "@/lib/hooks/use-currencies";
import {
  getNetwork,
} from "@orbs-network/spot-ui";
import { useActionHandlers } from "./use-action-handlers";
import { useRefetchSelectedCurrenciesBalances } from "./use-balances";
import { Field } from "../types";

const useCallbacks = () => {
  const wrapToastId = useRef<number>(null);
  const approveToastId = useRef<number>(null);
  const createOrderToastId = useRef<number>(null);
  const cancelOrderToastId = useRef<number>(null);
  const { inputCurrency, outputCurrency } = useDerivedSwap();
  const { handleCurrencyChange } = useActionHandlers();
  const { chainId } = useConnection();
  const { mutateAsync: refetchBalances } =
    useRefetchSelectedCurrenciesBalances();

  const symbol = useMemo(() => {
    return isNativeAddress(inputCurrency?.address)
      ? (getWrappedNativeCurrency(chainId!)?.symbol ?? "")
      : inputCurrency?.symbol;
  }, [inputCurrency?.address, inputCurrency?.symbol, chainId]);

  const onWrapRequest = useCallback(() => {
    wrapToastId.current = toast.loading(
      `Wrapping ${inputCurrency?.symbol}...`,
      {
        description: "Proceed in wallet",
      },
    ) as number;
  }, [inputCurrency?.symbol]);

  const onWrapSuccess = useCallback(
    async ({ explorerUrl }: OnWrapSuccessCallback) => {
      const network = getNetwork(chainId);

      handleCurrencyChange(network?.wToken.address ?? "", Field.INPUT);
      toast.success(`Wrapped ${inputCurrency?.symbol}`, {
        description: (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            View on explorer
          </a>
        ),
        id: wrapToastId.current as number,
      });
      refetchBalances();
    },
    [handleCurrencyChange, inputCurrency?.symbol, chainId, refetchBalances],
  );

  const onApproveRequest = useCallback(() => {
    approveToastId.current = toast.loading(`Approving ${symbol}...`, {
      description: "Proceed in wallet",
    }) as number;
  }, [symbol]);

  const onApproveSuccess = useCallback(
    ({ explorerUrl }: OnApproveSuccessCallback) => {
      toast.success(`Approved ${symbol}`, {
        id: approveToastId.current as number,
        description: (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            View on explorer
          </a>
        ),
      });
    },
    [symbol],
  );

  const onSignOrderRequest = useCallback(() => {
    createOrderToastId.current = toast.loading(
      <TokensPair
        prefix="Creating order"
        srcTokenAddress={inputCurrency?.address}
        dstTokenAddress={outputCurrency?.address}
      />,
      {
        description: "Proceed in the Utila mobile app",
      },
    ) as number;
  }, [inputCurrency?.address, outputCurrency?.address]);

  const onSignOrderSuccess = useCallback(() => {
    if (!createOrderToastId.current) return;

    toast.loading(
      <TokensPair
        prefix="Creating order"
        srcTokenAddress={inputCurrency?.address}
        dstTokenAddress={outputCurrency?.address}
      />,
      {
        id: createOrderToastId.current,
        description: "Submitting order...",
      },
    );
  }, [inputCurrency?.address, outputCurrency?.address]);

  const onCreateOrderSuccess = useCallback(() => {
    toast.success("Order created", {
      id: createOrderToastId.current as number,
    });
  }, []);

  const onOrderFilled = useCallback((order: Order) => {
    toast.success(
      <TokensPair
        prefix="Order filled"
        srcTokenAddress={order.srcTokenAddress}
        dstTokenAddress={order.dstTokenAddress}
      />,
    );
  }, []);

  const onSubmitOrderFailed = useCallback(({ code }: ParsedError) => {
    toast.dismiss(createOrderToastId.current as number);
    toast.error(`Failed to submit order: ${code}`);
  }, []);

  const onSubmitOrderRejected = useCallback(() => {
    toast.dismiss(createOrderToastId.current as number);
    toast.error("Order submission rejected", {
      id: createOrderToastId.current as number,
    });
  }, []);

  const onOrderCreated = useCallback((order: Order) => {
    toast.success(
      <TokensPair
        prefix="Order created"
        srcTokenAddress={order.srcTokenAddress}
        dstTokenAddress={order.dstTokenAddress}
      />,
      {
        id: createOrderToastId.current as number,
        duration: 10_000,
        closeButton: true,
        description: "",
      },
    );
  }, []);

  const onOrdersProgressUpdate = useCallback(() => {
    refetchBalances();
  }, [refetchBalances]);

  const onCancelOrderRequest = useCallback(() => {
    cancelOrderToastId.current = toast.loading("Canceling order...", {
      description: "Proceed in wallet",
    }) as number;
  }, []);

  const onCancelOrderSuccess = useCallback(({ explorerUrl }: OnCancelOrderSuccess) => {
    toast.success("Order cancelled", {
      id: cancelOrderToastId.current as number,
      description: explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-500 hover:text-blue-600"
        >
          View on explorer
        </a>
      ) : undefined,
    });
    cancelOrderToastId.current = null;
  }, []);

  const onCancelOrderFailed = useCallback((error: Error) => {
    toast.error("Failed to cancel order", {
      id: cancelOrderToastId.current as number,
      description: error.message,
    });
    cancelOrderToastId.current = null;
  }, []);

  const onCopy = useCallback(() => {
    toast.success("Copied to clipboard");
  }, []);

  return {
    onWrapRequest,
    onApproveRequest,
    onSignOrderRequest,
    onWrapSuccess,
    onApproveSuccess,
    onCreateOrderSuccess,
    onSignOrderSuccess,
    onOrderFilled,
    onSubmitOrderFailed,
    onSubmitOrderRejected,
    onOrderCreated,
    onOrdersProgressUpdate,
    onCancelOrderRequest,
    onCancelOrderSuccess,
    onCancelOrderFailed,
    onCopy,
  };
};

export const SpotHooks = {
  useCallbacks,
};

export const useSpotToken = (address?: string) => {
  const currency = useCurrency(address);

  return useMemo((): Token | undefined => {
    if (!currency) return undefined;

    return {
      address: currency.address,
      decimals: currency.decimals,
      symbol: currency.symbol,
      logoUrl: currency.logoUrl,
    };
  }, [currency]);
};

export const useSpotMarketReferencePrice = () => {
  const { trade, isLoadingTrade } = useDerivedSwap();

  return useMemo(() => {
    return {
      value: trade?.outAmount,
      isLoading: isLoadingTrade,
    };
  }, [trade, isLoadingTrade]);
};


export const useWalletInteractions = () => {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { chainId } = useConnection();

  const waitForTx = useCallback(
    async (hash: `0x${string}`) => {
      const result = await fetch(
        `/api/transaction-receipt?chainId=${chainId}&hash=${hash}`,
      );
      if (!result.ok) {
        throw new Error("Failed to get transaction receipt");
      }
      const receipt = await result.json();
      if (receipt?.status === "reverted") {
        throw new Error("Transaction reverted");
      }
      return hash;
    },
    [chainId],
  );

  return useMemo((): WalletInteractions => {
    const network = getNetwork(chainId);

    return {
      wrapNativeToken: async (amount: string) => {
        if (!walletClient) {
          throw new Error("Wallet client not found");
        }
        if (!network?.wToken?.address) {
          throw new Error("wToken not found for chain");
        }
        const hash = await walletClient.writeContract({
          abi: [
            {
              name: "deposit",
              type: "function",
              stateMutability: "payable",
              inputs: [],
              outputs: [],
            },
          ],
          functionName: "deposit",
          address: network.wToken.address as `0x${string}`,
          args: [],
          value: BigInt(amount),
          chain: walletClient.chain,
          account: walletClient.account,
        });
        return waitForTx(hash);
      },
      approveToken: async (props: ApproveTokenProps) => {
        const maxUint256 = BigInt(
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        );
        if (!walletClient) {
          throw new Error("Wallet client not found");
        }
        const hash = await walletClient.writeContract({
          abi: erc20Abi,
          functionName: "approve",
          address: props.tokenAddress as `0x${string}`,
          args: [props.spenderAddress as `0x${string}`, maxUint256],
          chain: walletClient.chain,
          account: walletClient.account,
        });
        return waitForTx(hash);
      },
      cancelOrder: async (props: CancelOrderProps) => {
        if (!walletClient) {
          throw new Error("Wallet client not found");
        }
        const hash = await walletClient.writeContract({
          abi: props.abi,
          functionName: "cancel",
          address: props.contractAddress as `0x${string}`,
          args: props.args,
          chain: walletClient.chain,
          account: walletClient.account,
        });
        return waitForTx(hash);
      },
      signOrder: async (props: SignOrderProps) => {
        if (!walletClient) {
          throw new Error("Wallet client not found");
        }
        return walletClient.signTypedData({
          domain: props.domain as any,
          types: props.types as any,
          primaryType: props.primaryType,
          message: props.message as any,
          account: props.account,
        });
      },
      getAllowance: async (props: GetAllowanceProps) => {
        if (!publicClient) {
          throw new Error("Public client not found");
        }
        if (!walletClient) {
          throw new Error("Wallet client not found");
        }
        const result = await publicClient.readContract({
          address: props.tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "allowance",
          args: [
            walletClient.account?.address as `0x${string}`,
            props.spenderAddress as `0x${string}`,
          ],
        });
        return String(result);
      },
    };
  }, [walletClient, publicClient, chainId, waitForTx]);
};

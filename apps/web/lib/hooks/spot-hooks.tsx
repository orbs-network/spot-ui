/* eslint-disable @typescript-eslint/no-explicit-any */
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { getExplorerUrl, getWrappedNativeCurrency } from "@/lib/utils";
import {
  isNativeAddress,
  OnApproveSuccessCallback,
  OnWrapSuccessCallback,
  ParsedError,
  Partners,
  Order,
  type WalletInteractions,
  type OrderSigningRequest,
  type CancelOrderProps,
  type ApproveTokenProps,
  type GetAllowanceProps,
} from "@orbs-network/spot-react";
import { erc20Abi } from "viem";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useConnection, usePublicClient, useWalletClient } from "wagmi";

import TokensPair from "@/components/tokens-pair";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import * as chains from "viem/chains";
import { getPartners } from "@orbs-network/spot-ui";
import { DEFAULT_PARTNER } from "../consts";
import { useRefetchSelectedCurrenciesBalances } from "./use-balances";

export const useCallbacks = () => {
  const wrapToastId = useRef<number>(null);
  const approveToastId = useRef<number>(null);
  const createOrderToastId = useRef<number>(null);
  const { inputCurrency, outputCurrency } = useDerivedSwap();
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
    async ({ txHash }: OnWrapSuccessCallback) => {
      const wrappedNativeCurrency = getWrappedNativeCurrency(chainId);
      const explorerUrl = getExplorerUrl(chainId, txHash);

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
      // Keep the selected native token unchanged. Switching it here changes
      // the Spot form scope and clears the terminal execution before the
      // success UI can render. Include the wrapped token explicitly because it
      // is not part of the selected native/output pair.
      await refetchBalances(
        wrappedNativeCurrency?.address ? [wrappedNativeCurrency.address] : [],
      );
    },
    [inputCurrency?.symbol, chainId, refetchBalances],
  );

  const onApproveRequest = useCallback(() => {
    approveToastId.current = toast.loading(`Approving ${symbol}...`, {
      description: "Proceed in wallet",
    }) as number;
  }, [symbol]);

  const onApproveSuccess = useCallback(
    ({ txHash }: OnApproveSuccessCallback) => {
      const explorerUrl = getExplorerUrl(chainId, txHash);
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
    [chainId, symbol],
  );

  const onSignOrderRequest = useCallback(() => {
    createOrderToastId.current = toast.loading(
      <TokensPair
        prefix="Creating order"
        srcTokenAddress={inputCurrency?.address}
        dstTokenAddress={outputCurrency?.address}
      />,
      {
        description: "Proceed in wallet",
      },
    ) as number;
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
    void refetchBalances([]).catch(() => undefined);
  }, [refetchBalances]);

  const onOrderCancelled = useCallback(() => {
    toast.success("Order cancelled");
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
    onOrderFilled,
    onSubmitOrderFailed,
    onSubmitOrderRejected,
    onOrderCreated,
    onOrdersProgressUpdate,
    onOrderCancelled,
    onCopy,
  };
};

export const useSpotMarketQuote = () => {
  const { trade, isLoadingTrade } = useDerivedSwap();

  return useMemo(() => {
    return {
      quotedOutputAmountRaw: trade?.outAmount,
      isLoading: isLoadingTrade,
    };
  }, [trade, isLoadingTrade]);
};

export const useSpotPartner = () => {
  const { partner } = useSwapParams();

  const { chainId } = useConnection();

  return useMemo(() => {
    const selected = partner?.split("_")[0];

    if (selected) {
      return selected as Partners;
    }
    if (!chainId) {
      return DEFAULT_PARTNER;
    }

    switch (chainId) {
      case chains.base.id:
      case chains.polygon.id:
        return Partners.Quick;
      case chains.bsc.id:
        return Partners.Thena;
      case chains.sonic.id:
        return Partners.Spooky;
      case chains.sei.id:
        return Partners.Nami;
      case chains.linea.id:
        return Partners.Lynex;
      default:
        return (getPartners().find((p) => p.chainId === chainId)?.name ||
          DEFAULT_PARTNER) as Partners;
    }
  }, [chainId, partner]);
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
    const wrappedNativeCurrency = getWrappedNativeCurrency(chainId);

    return {
      wrapNativeToken: async (amount: string) => {
        if (!walletClient) {
          throw new Error("Wallet client not found");
        }
        if (!wrappedNativeCurrency?.address) {
          throw new Error("Wrapped native token not found for chain");
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
          address: wrappedNativeCurrency.address as `0x${string}`,
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
      signOrder: async (request: OrderSigningRequest) => {
        if (!walletClient) {
          throw new Error("Wallet client not found");
        }
        const { signerAddress, typedData } = request;
        return walletClient.signTypedData({
          domain: typedData.domain as any,
          types: typedData.types as any,
          primaryType: typedData.primaryType,
          message: typedData.message as any,
          account: signerAddress,
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

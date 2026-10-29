/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  WalletInteractions,
  OrderSigningRequest,
  CancelOrderProps,
  ApproveTokenProps,
  GetAllowanceProps,
} from "@orbs-network/spot-react";
import { useCallback, useMemo } from "react";
import { erc20Abi } from "viem";
import { useConnection, usePublicClient, useWalletClient } from "wagmi";
import { getWrappedNativeCurrency } from "../utils";
import { wagmiConfig } from "../wagmi-config";

export const useWalletInteractions = () => {
  const { chain, chainId } = useConnection({ config: wagmiConfig });
  const { data: walletClient } = useWalletClient({ config: wagmiConfig, chainId });
  const publicClient = usePublicClient({ config: wagmiConfig, chainId });

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
        if (!chain) {
          throw new Error(`Unsupported wallet chain: ${chainId}`);
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
          chain,
          account: walletClient.account,
        });
        return waitForTx(hash);
      },
      approveToken: async (props: ApproveTokenProps) => {
        if (!walletClient) {
          throw new Error("Wallet client not found");
        }
        if (!chain) {
          throw new Error(`Unsupported wallet chain: ${chainId}`);
        }
        const hash = await walletClient.writeContract({
          abi: erc20Abi,
          functionName: "approve",
          address: props.tokenAddress as `0x${string}`,
          args: [props.spenderAddress as `0x${string}`, BigInt(props.amount)],
          chain,
          account: walletClient.account,
        });
        return waitForTx(hash);
      },
      cancelOrder: async (props: CancelOrderProps) => {
        if (!walletClient) {
          throw new Error("Wallet client not found");
        }
        if (!chain) {
          throw new Error(`Unsupported wallet chain: ${chainId}`);
        }
        if (props.order.chainId !== chainId) {
          throw new Error(`Switch to chain ${props.order.chainId} to cancel this order`);
        }
        const hash = await walletClient.writeContract({
          abi: props.abi,
          functionName: "cancel",
          address: props.contractAddress as `0x${string}`,
          args: props.args,
          chain,
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
      getTokenBalance: async ({ tokenAddress }) => {
        if (!publicClient) {
          throw new Error("Public client not found");
        }
        if (!walletClient?.account?.address) {
          throw new Error("Wallet account not found");
        }
        const account = walletClient.account.address;
        const assertWalletContext = async () => {
          const [connectedChainId, accounts] = await Promise.all([
            walletClient.getChainId(),
            walletClient.getAddresses(),
          ]);
          if (
            connectedChainId !== chainId ||
            publicClient.chain?.id !== chainId ||
            accounts[0]?.toLowerCase() !== account.toLowerCase()
          ) {
            throw new Error("Wallet account or network changed while reading the token balance");
          }
        };
        await assertWalletContext();
        const result = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        });
        await assertWalletContext();
        return String(result);
      },
    };
  }, [walletClient, publicClient, chain, chainId, waitForTx]);
};

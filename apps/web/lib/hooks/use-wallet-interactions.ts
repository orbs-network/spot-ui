/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  WalletInteractions,
  OrderSigningRequest,
  CancelOrderProps,
  ApproveTokenProps,
  GetAllowanceProps,
} from "@orbs-network/spot-react";
import { useCallback, useMemo } from "react";
import { erc20Abi, type PublicClient, type WalletClient } from "viem";
import { useConnection, usePublicClient, useWalletClient } from "wagmi";
import { getWrappedNativeCurrency } from "../utils";
import { wagmiConfig } from "../wagmi-config";

type BalanceReadContext = {
  walletClient: Pick<WalletClient, "getChainId" | "getAddresses">;
  publicClient: Pick<PublicClient, "chain">;
  chainId?: number;
  account: `0x${string}`;
};

const assertBalanceReadContext = async ({
  walletClient,
  publicClient,
  chainId,
  account,
}: BalanceReadContext): Promise<void> => {
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

    const requireWalletClient = () => {
      if (!walletClient) throw new Error("Wallet client not found");
      return walletClient;
    };
    const requirePublicClient = () => {
      if (!publicClient) throw new Error("Public client not found");
      return publicClient;
    };
    const getWriteContext = () => {
      const client = requireWalletClient();
      if (!chain) throw new Error(`Unsupported wallet chain: ${chainId}`);
      return { client, chain };
    };

    return {
      wrapNativeToken: async (amount: string) => {
        const { client, chain } = getWriteContext();
        if (!wrappedNativeCurrency?.address) {
          throw new Error("Wrapped native token not found for chain");
        }
        const hash = await client.writeContract({
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
          account: client.account,
        });
        return waitForTx(hash);
      },
      approveToken: async (props: ApproveTokenProps) => {
        const { client, chain } = getWriteContext();
        const hash = await client.writeContract({
          abi: erc20Abi,
          functionName: "approve",
          address: props.tokenAddress as `0x${string}`,
          args: [props.spenderAddress as `0x${string}`, BigInt(props.amount)],
          chain,
          account: client.account,
        });
        return waitForTx(hash);
      },
      cancelOrder: async (props: CancelOrderProps) => {
        const { client, chain } = getWriteContext();
        if (props.order.chainId !== chainId) {
          throw new Error(`Switch to chain ${props.order.chainId} to cancel this order`);
        }
        const hash = await client.writeContract({
          abi: props.abi,
          functionName: "cancel",
          address: props.contractAddress as `0x${string}`,
          args: props.args,
          chain,
          account: client.account,
        });
        return waitForTx(hash);
      },
      signOrder: async (request: OrderSigningRequest) => {
        const client = requireWalletClient();
        const { signerAddress, typedData } = request;
        return client.signTypedData({
          domain: typedData.domain as any,
          types: typedData.types as any,
          primaryType: typedData.primaryType,
          message: typedData.message as any,
          account: signerAddress,
        });
      },
      getAllowance: async (props: GetAllowanceProps) => {
        const readClient = requirePublicClient();
        const client = requireWalletClient();
        const result = await readClient.readContract({
          address: props.tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "allowance",
          args: [
            client.account?.address as `0x${string}`,
            props.spenderAddress as `0x${string}`,
          ],
        });
        return String(result);
      },
      getTokenBalance: async ({ tokenAddress }) => {
        const readClient = requirePublicClient();
        if (!walletClient?.account?.address) {
          throw new Error("Wallet account not found");
        }
        const account = walletClient.account.address;
        const context = { walletClient, publicClient: readClient, chainId, account };
        // A completed-wrap retry must not use a balance read across wallet changes.
        await assertBalanceReadContext(context);
        const result = await readClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        });
        await assertBalanceReadContext(context);
        return String(result);
      },
    };
  }, [walletClient, publicClient, chain, chainId, waitForTx]);
};

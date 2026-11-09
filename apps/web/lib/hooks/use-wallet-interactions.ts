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
import { getWrappedNativeCurrency, isNativeAddress } from "../utils";
import { wagmiConfig } from "../wagmi-config";
import { useDerivedSwap } from "./use-derived-swap";
import { useWrappedNativeTransaction } from "./use-wrap";
import { useRefetchSelectedCurrenciesBalances } from "./use-balances";

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
  const { inputCurrency } = useDerivedSwap();
  const { chain, chainId } = useConnection({ config: wagmiConfig });
  const { data: walletClient } = useWalletClient({ config: wagmiConfig, chainId });
  const publicClient = usePublicClient({ config: wagmiConfig, chainId });
  const { mutateAsync: convertNativeToken, complete } = useWrappedNativeTransaction();
  const { mutateAsync: refetchBalances } = useRefetchSelectedCurrenciesBalances();

  const waitForTx = useCallback(
    async (hash: `0x${string}`) => {
      const result = await fetch(
        `/api/transaction-receipt?chainId=${chainId}&hash=${hash}`,
      );
      if (!result.ok) {
        throw new Error("Failed to get transaction receipt");
      }
      const receipt = await result.json();
      if (receipt?.replacementReason === "cancelled" || receipt?.replacementReason === "replaced") {
        throw new Error("Transaction was cancelled or replaced");
      }
      if (receipt?.status === "reverted") {
        throw new Error("Transaction reverted");
      }
      if (receipt?.status !== "success") {
        throw new Error("Transaction confirmation is unavailable");
      }
      return hash;
    },
    [chainId],
  );

  return useMemo((): WalletInteractions => {
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
      shouldWrap: () => isNativeAddress(inputCurrency?.address),
      wrapNativeToken: async (amount: string) => {
        const { operation, contextChanged } = await convertNativeToken({ action: "wrap", amount });
        if (contextChanged) {
          throw new Error("Wallet account or network changed. Review the wrapped balance before continuing.");
        }
        if (operation.action !== "wrap" || operation.amount !== amount) {
          // Finish recovery of the previous conversion, then require a fresh review.
          // Never count its receipt as the requested wrap or immediately deposit again.
          const wrappedAddress = getWrappedNativeCurrency(chainId)?.address;
          await refetchBalances(wrappedAddress ? [wrappedAddress] : []);
          complete(operation.hash);
          throw new Error("A previous token conversion is confirmed. Review its balance before wrapping a different amount.");
        }
        complete(operation.hash);
        return operation.hash;
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
  }, [walletClient, publicClient, chain, chainId, waitForTx, inputCurrency?.address, convertNativeToken, complete, refetchBalances]);
};

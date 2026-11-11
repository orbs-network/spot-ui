/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  WalletInteractions,
  OrderSigningRequest,
  CancelOrderProps,
  ApproveTokenProps,
  GetAllowanceProps,
} from "@orbs-network/spot-react";
import { useCallback, useMemo, useRef } from "react";
import { erc20Abi, type PublicClient, type WalletClient } from "viem";
import { useConnection, usePublicClient, useWalletClient } from "wagmi";
import { getWrappedNativeCurrency, isNativeAddress } from "../utils";
import { wagmiConfig } from "../wagmi-config";
import { useDerivedSwap } from "./use-derived-swap";
import { useWrappedNativeTransaction } from "./use-wrap";
import { useRefetchSelectedCurrenciesBalances } from "./use-balances";

type AllowanceReadContext = {
  walletClient: Pick<WalletClient, "getChainId" | "getAddresses">;
  publicClient: Pick<PublicClient, "chain">;
  chainId?: number;
  account: `0x${string}`;
};

const assertAllowanceReadContext = async ({
  walletClient,
  publicClient,
  chainId,
  account,
}: AllowanceReadContext): Promise<void> => {
  const [connectedChainId, accounts] = await Promise.all([
    walletClient.getChainId(),
    walletClient.getAddresses(),
  ]);
  if (
    connectedChainId !== chainId ||
    publicClient.chain?.id !== chainId ||
    accounts[0]?.toLowerCase() !== account.toLowerCase()
  ) {
    throw new Error("Wallet account or network changed while reading token allowance");
  }
};

const getApprovalBlock = (value: unknown): bigint => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^(?:\d+|0x[\da-f]+)$/i.test(value)) return BigInt(value);
  throw new Error("Approval confirmation is missing a valid block number. Check the transaction before trying again.");
};

export const useWalletInteractions = () => {
  const { inputCurrency } = useDerivedSwap();
  const { chain, chainId } = useConnection({ config: wagmiConfig });
  const { data: walletClient } = useWalletClient({ config: wagmiConfig, chainId });
  const publicClient = usePublicClient({ config: wagmiConfig, chainId });
  const { mutateAsync: convertNativeToken, complete } = useWrappedNativeTransaction();
  const { mutateAsync: refetchBalances } = useRefetchSelectedCurrenciesBalances();
  const confirmedApprovalBlocks = useRef(new Map<string, bigint>());

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
      return receipt;
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
    const approvalKey = (props: GetAllowanceProps, account: string) =>
      JSON.stringify([chainId, account.toLowerCase(), props.tokenAddress.toLowerCase(), props.spenderAddress.toLowerCase()]);
    const getAllowance = async (props: ApproveTokenProps): Promise<string> => {
      const readClient = requirePublicClient();
      const client = requireWalletClient();
      if (!client.account?.address) throw new Error("Wallet account not found");
      const context = { walletClient: client, publicClient: readClient, chainId, account: client.account.address };
      await assertAllowanceReadContext(context);
      const key = approvalKey(props, client.account.address);
      const confirmedBlock = confirmedApprovalBlocks.current.get(key);
      let blockNumber: bigint | undefined;
      if (confirmedBlock !== undefined) {
        const currentBlock = await readClient.getBlockNumber({ cacheTime: 0 });
        const minimumBlock = confirmedApprovalBlocks.current.get(key) ?? confirmedBlock;
        // A lagging RPC head must not return allowance from before the confirmed approval.
        blockNumber = currentBlock > minimumBlock ? currentBlock : minimumBlock;
      }
      const result = await readClient.readContract({
        address: props.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [client.account.address, props.spenderAddress as `0x${string}`],
        ...(blockNumber !== undefined ? { blockNumber } : {}),
      });
      await assertAllowanceReadContext(context);
      console.log("Allowance check", JSON.stringify({
        tokenAddress: props.tokenAddress, spenderAddress: props.spenderAddress,
        required: props.amount, actual: String(result), blockNumber: blockNumber?.toString() ?? "latest",
      }));

      return String(result);
    };

    return {
      shouldWrap: () => isNativeAddress(inputCurrency?.address),
      shouldApprove: async (props: ApproveTokenProps) => BigInt(await getAllowance(props)) < BigInt(props.amount),
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
        if (!client.account?.address) throw new Error("Wallet account not found");
        const hash = await client.writeContract({
          abi: erc20Abi,
          functionName: "approve",
          address: props.tokenAddress as `0x${string}`,
          args: [props.spenderAddress as `0x${string}`, BigInt(props.approvalAmount)],
          chain,
          account: client.account,
        });
        const receipt = await waitForTx(hash);
        const key = approvalKey(props, client.account.address);
        const block = getApprovalBlock(receipt.blockNumber);
        const previousBlock = confirmedApprovalBlocks.current.get(key);
        if (previousBlock === undefined || block > previousBlock) confirmedApprovalBlocks.current.set(key, block);
        return hash;
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
        await waitForTx(hash);
        return hash;
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
    };
  }, [walletClient, publicClient, chain, chainId, waitForTx, inputCurrency?.address, convertNativeToken, complete, refetchBalances]);
};

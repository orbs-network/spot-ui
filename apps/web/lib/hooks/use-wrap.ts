import { skipToken, useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useConnection, useWalletClient } from "wagmi";
import { getConnection, watchConnection } from "wagmi/actions";
import { getWrappedNativeCurrency } from "../utils";
import wethAbi from "../abi/wethAbi.json";
import { TransactionRevertedError, useGetTransactionReceiptCallback } from "./use-get-transaction-receipt";
import { wagmiConfig } from "../wagmi-config";
import type { WrappedNativeAction } from "../types";

const WRAPPED_NATIVE_TRANSACTION_KEY = ["wrapped-native-transaction"];

type WrappedNativeOperation = {
  hash: `0x${string}`;
  action: WrappedNativeAction;
  amount: string;
  status: "submitted" | "confirmed";
};

export class UnconfirmedWrappedNativeTransaction extends Error {
  constructor(readonly hash: `0x${string}`) {
    super("Transaction submitted; confirmation is unavailable");
  }
}

export const useWrappedNativeTransaction = () => {
  const { chainId, chain, address: accountAddress } = useConnection({ config: wagmiConfig });
  const { data: walletClient } = useWalletClient({ config: wagmiConfig, chainId });
  const { mutateAsync: getTransactionReceipt } = useGetTransactionReceiptCallback();
  const address = getWrappedNativeCurrency(chainId)?.address;
  const queryClient = useQueryClient();
  const pendingTransactions = useIsMutating({ mutationKey: WRAPPED_NATIVE_TRANSACTION_KEY });
  const operationKey = [...WRAPPED_NATIVE_TRANSACTION_KEY, "operation", chainId,
    accountAddress?.toLowerCase(), address?.toLowerCase()];
  const { data: operation } = useQuery<WrappedNativeOperation | null>({
    queryKey: operationKey,
    queryFn: skipToken,
    initialData: null,
    // A submitted or confirmed-but-unfinished conversion must survive navigation and remounts.
    gcTime: Infinity,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationKey: WRAPPED_NATIVE_TRANSACTION_KEY,
    retry: false,
    mutationFn: async ({ action, amount }: { action: WrappedNativeAction; amount: string }) => {
      if (!walletClient) throw new Error("Wallet client not found");
      if (!chain) throw new Error(`Unsupported wallet chain: ${chainId}`);
      if (!address) throw new Error("Wrapped native currency address not found");

      const account = walletClient.account.address;
      const matchesConnection = () => {
        const connection = getConnection(wagmiConfig);
        return connection.status === "connected" && connection.chainId === chain.id &&
          connection.address?.toLowerCase() === account.toLowerCase();
      };
      let contextChanged = !matchesConnection();
      const unwatch = watchConnection(wagmiConfig, {
        onChange: () => { contextChanged ||= !matchesConnection(); },
      });
      try {
        const [connectedChainId, accounts] = await Promise.all([
          walletClient.getChainId(), walletClient.getAddresses(),
        ]);
        if (contextChanged || !matchesConnection() || connectedChainId !== chain.id ||
          accounts[0]?.toLowerCase() !== account.toLowerCase()) {
          throw new Error("Wallet account or network changed. Review the wrap again.");
        }

        // One unfinished conversion per account/network: editing the amount never submits a duplicate.
        let current = queryClient.getQueryData<WrappedNativeOperation | null>(operationKey);
        if (!current) {
          if (BigInt(amount) <= BigInt(0)) throw new Error("Enter a positive amount");
          const hash = action === "wrap"
            ? await walletClient.writeContract({
                abi: wethAbi, functionName: "deposit", account: walletClient.account,
                address: address as `0x${string}`, value: BigInt(amount), chain,
              })
            : await walletClient.writeContract({
                abi: wethAbi, functionName: "withdraw", args: [BigInt(amount)],
                account: walletClient.account, address: address as `0x${string}`, chain,
              });
          current = { hash, action, amount, status: "submitted" };
          queryClient.setQueryData(operationKey, current);
        }
        if (current.status === "submitted") {
          try {
            // Read the original chain even if the wallet changes while this transaction confirms.
            await getTransactionReceipt({ chainId: chain.id, hash: current.hash });
            current = { ...current, status: "confirmed" };
            queryClient.setQueryData(operationKey, current);
          } catch (error) {
            if (error instanceof TransactionRevertedError) {
              queryClient.setQueryData(operationKey, null);
              throw error;
            }
            throw new UnconfirmedWrappedNativeTransaction(current.hash);
          }
        }
        return { operation: current, contextChanged: contextChanged || !matchesConnection() };
      } finally {
        unwatch();
      }
    },
  });
  const { mutateAsync: runTransaction } = mutation;
  const mutateAsync = useCallback((params: { action: WrappedNativeAction; amount: string }) => {
    // The shared mutation cache also protects against remounts while a deposit is pending.
    if (queryClient.isMutating({ mutationKey: WRAPPED_NATIVE_TRANSACTION_KEY })) {
      return Promise.reject(new Error("A wrap or unwrap transaction is already pending"));
    }
    return runTransaction(params);
  }, [runTransaction, queryClient]);
  const complete = (hash: `0x${string}`) => {
    if (queryClient.getQueryData<WrappedNativeOperation | null>(operationKey)?.hash === hash) {
      queryClient.setQueryData(operationKey, null);
    }
  };

  return { mutateAsync, complete, operation, isPending: pendingTransactions > 0 };
};

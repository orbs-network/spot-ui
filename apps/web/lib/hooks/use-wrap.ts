import { useMutation } from "@tanstack/react-query";
import { getWrappedNativeCurrency } from "../utils";
import wethAbi from "../abi/wethAbi.json";
import { useGetTransactionReceiptCallback } from "./use-get-transaction-receipt";
import { useConnection, useWalletClient } from "wagmi";
import { wagmiConfig } from "../wagmi-config";
import type { WrappedNativeAction } from "../types";

export const useWrappedNativeTransaction = () => {
  const { chainId, chain } = useConnection({ config: wagmiConfig });
  const { data: walletClient } = useWalletClient({ config: wagmiConfig, chainId });
  const { mutateAsync: getTransactionReceiptCallback } =
    useGetTransactionReceiptCallback();

  const address = getWrappedNativeCurrency(chainId)?.address ?? "";
  return useMutation({
    mutationFn: async ({
      action,
      amount,
    }: {
      action: WrappedNativeAction;
      amount: string;
    }) => {
      if (!walletClient) {
        throw new Error("Wallet client not found");
      }
      if (!chain) {
        throw new Error(`Unsupported wallet chain: ${chainId}`);
      }
      if (!address) {
        throw new Error("Wrapped native currency address not found");
      }
      const hash =
        action === "wrap"
          ? await walletClient.writeContract({
              abi: wethAbi,
              functionName: "deposit",
              account: walletClient.account,
              address: address as `0x${string}`,
              value: BigInt(amount),
              chain,
            })
          : await walletClient.writeContract({
              abi: wethAbi,
              functionName: "withdraw",
              args: [BigInt(amount)],
              account: walletClient.account,
              address: address as `0x${string}`,
              chain,
            });
      return getTransactionReceiptCallback(hash);
    },
  });
};

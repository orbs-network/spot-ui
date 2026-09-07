import { useMutation } from "@tanstack/react-query";
import { useConnection, useWalletClient } from "wagmi";
import { getWrappedNativeCurrency } from "../utils";
import wethAbi from "../abi/wethAbi.json";
import { useGetTransactionReceiptCallback } from "./use-get-transaction-receipt";
import type { WrappedNativeAction } from "../types";

export const useWrappedNativeTransaction = () => {
  const { data: walletClient } = useWalletClient();
  const { address: account, chainId } = useConnection();
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
      if (!address) {
        throw new Error("Wrapped native currency address not found");
      }
      const hash =
        action === "wrap"
          ? await walletClient.writeContract({
              abi: wethAbi,
              functionName: "deposit",
              account,
              address: address as `0x${string}`,
              value: BigInt(amount),
              chain: walletClient.chain,
            })
          : await walletClient.writeContract({
              abi: wethAbi,
              functionName: "withdraw",
              args: [BigInt(amount)],
              account,
              address: address as `0x${string}`,
              chain: walletClient.chain,
            });
      return getTransactionReceiptCallback(hash);
    },
  });
};

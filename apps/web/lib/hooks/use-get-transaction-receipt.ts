import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { TransactionReceipt } from "viem";
import { useUtilaWalletSession } from "./use-utila-wallet-session";

export const useGetTransactionReceiptCallback = () => {
  const { chainId } = useUtilaWalletSession();
  return useMutation({
    mutationFn: async (hash: `0x${string}`) => {
      const result = await axios.get(
        `/api/transaction-receipt?chainId=${chainId}&hash=${hash}`
      );
      const receipt = result.data as TransactionReceipt;
      if (receipt.status === "reverted") {
        throw new Error(
          receipt.logs?.[0]?.data?.toString() ?? "Transaction failed"
        );
      }
      return receipt;
    },
  });
};

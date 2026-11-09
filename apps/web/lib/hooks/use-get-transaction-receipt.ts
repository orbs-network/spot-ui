import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import type { TransactionReceipt } from "viem";

export class TransactionRevertedError extends Error {}

export const useGetTransactionReceiptCallback = () => {
  return useMutation({
    mutationFn: async ({ chainId, hash }: { chainId: number; hash: `0x${string}` }) => {
      const result = await axios.get(
        `/api/transaction-receipt?chainId=${chainId}&hash=${hash}`
      );
      const receipt = result.data as TransactionReceipt & {
        replacementReason?: "repriced" | "cancelled" | "replaced";
      };
      if (receipt.replacementReason === "cancelled" || receipt.replacementReason === "replaced") {
        throw new TransactionRevertedError("The transaction was cancelled or replaced");
      }
      if (receipt.status === "reverted") {
        throw new TransactionRevertedError(
          receipt.logs?.[0]?.data?.toString() ?? "Transaction failed"
        );
      }
      if (receipt.status !== "success") {
        throw new Error("Transaction confirmation is unavailable");
      }
      return receipt;
    },
  });
};

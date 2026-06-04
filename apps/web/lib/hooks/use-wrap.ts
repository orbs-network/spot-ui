import { useMutation } from "@tanstack/react-query";
import { useConnection, useWalletClient } from "wagmi";
import { getWrappedNativeCurrency } from "../utils";
import wethAbi from "../abi/wethAbi.json";
import { useGetTransactionReceiptCallback } from "./use-get-transaction-receipt";
import { useActiveConnection } from "./use-active-connection";

export const useWrap = () => {
  const { data: walletClient } = useWalletClient();
  const { chainId } = useConnection();
  const { address: account } = useActiveConnection();
  const { mutateAsync: getTransactionReceiptCallback } =
    useGetTransactionReceiptCallback();

  const address = getWrappedNativeCurrency(chainId)?.address ?? "";
  return useMutation({
    mutationFn: async (amount: string) => {
      if (!walletClient) {
        throw new Error("Wallet client not found");
      }
      if (!address) {
        throw new Error("Wrapped native currency address not found");
      }
      const hash = await walletClient.writeContract({
        abi: wethAbi,
        functionName: "deposit",
        account,
        address: address as `0x${string}`,
        value: BigInt(amount),
        chain: walletClient.chain,
      });
      return getTransactionReceiptCallback(hash);
    },
  });
};

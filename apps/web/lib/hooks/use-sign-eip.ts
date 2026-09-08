import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import { useMutation } from "@tanstack/react-query";
import { useSignTypedData } from "wagmi";

export const useSignEip = () => {
  const { signTypedDataAsync } = useSignTypedData();

  return useMutation({
    mutationFn: async (quote: Quote) => {
      const signature = await signTypedDataAsync({
        ...quote.eip712,
        account: quote.user,
      });
      return signature;
    },
    onSuccess: (data) => {
      console.log(data);
    },
    onError: (error) => {
      console.error(error);
    },
  });
};

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi } from "viem";
import { useConnection, usePublicClient, useWalletClient } from "wagmi";
import { useGetTransactionReceiptCallback } from "./use-get-transaction-receipt";
import BN from "bignumber.js";
import { useMemo } from "react";
import { useParseNativeCurrencyAddress } from "./common";

const useGetAllowance = (
  spender: string,
  tokenAddress?: string,
  amount?: string
) => {
  const publicClient = usePublicClient();
  const account = useConnection().address;
  return useMutation({
    mutationFn: async () => {
      if (!publicClient || !tokenAddress || !amount) {
        throw new Error("Missing required parameters");
      }
      const allowance = await publicClient!.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account as `0x${string}`, spender as `0x${string}`],
      });
      console.log({allowance});
      
      return BN(allowance).gte(BN(amount ?? "0"));
    },
  });
};

export const useApproval = (
  spender: string,
  _currencyAddress?: string,
  amount?: string
) => {
  const currencyAddress = useParseNativeCurrencyAddress(_currencyAddress);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { mutateAsync: getTransactionReceiptCallback } =
    useGetTransactionReceiptCallback();
  const { mutateAsync: getAllowance } = useGetAllowance(
    spender,
    currencyAddress,
    amount
  );
  const queryClient = useQueryClient();
  const allowanceKey = useMemo(
    () => ["allowance", spender, currencyAddress, amount],
    [spender, currencyAddress, amount]
  );

  const { data: hasAllowance, isLoading: isLoadingHasAllowance } = useQuery({
    queryKey: allowanceKey,
    queryFn: async () => {
      return getAllowance();
    },
    enabled:
      !!publicClient && !!spender && !!currencyAddress && !!amount && !!amount,
  });

  const { mutateAsync: approveCallback, isPending: isPendingApproval } =
    useMutation({
      mutationFn: async () => {
        if (!walletClient) {
          throw new Error("Wallet client not found");
        }

        const hash = await walletClient.writeContract({
          address: currencyAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [spender as `0x${string}`, BigInt(amount ?? "0")],
        });

        const receipt = await getTransactionReceiptCallback(hash);
        const hasAllowance = await getAllowance();

        if (!hasAllowance) {
          throw new Error("Approval failed");
        }

        return receipt;
      },
    });

  const { mutateAsync: ensureAllowance } = useMutation({
    mutationFn: async () => {
      return queryClient.ensureQueryData({
        queryKey: allowanceKey,
        queryFn: async () => {
          return getAllowance();
        },
      });
    },
  });

  return {
    hasAllowance,
    isLoadingHasAllowance,
    approve: approveCallback,
    isPendingApproval,
    ensureAllowance,
  };
};

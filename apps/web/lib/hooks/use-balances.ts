import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import axios from "axios";
import { useMemo } from "react";
import { useFormatNumber, useToAmountUI } from "./common";
import type { Balances, Currency } from "../types";
import { useCurrenciesQuery } from "./use-currencies-query";
import { useDerivedSwap } from "./use-derived-swap";

const fetchBalances = async (
  chainId: number,
  address: string | undefined,
  tokens: string[],
): Promise<Balances> => {
  const response = await axios.post<Balances>("/api/balances", {
    chainId,
    address,
    tokens,
  });
  return response.data;
};

const uniqueTokenAddresses = (addresses: (string | undefined)[]): string[] =>
  Array.from(
    new Map(
      addresses
        .filter((address): address is string => Boolean(address))
        .map((address) => [address.toLowerCase(), address]),
    ).values(),
  );

const useQueryKey = () => {
  const chainId = useActiveChainId();
  const { address } = useConnection();
  const { data: currencies } = useCurrenciesQuery();
  const addressesKey = useMemo(() => {
    const addrs = currencies?.map((it) => it.address) ?? [];
    return [...addrs].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join(",");
  }, [currencies]);
  return useMemo(
    () => ["balances", chainId, address, addressesKey],
    [chainId, address, addressesKey]
  );
};

export const useBalances = () => {
  const chainId = useActiveChainId();
  const { address } = useConnection();
  const { data: currencies } = useCurrenciesQuery();
  const addresses = useMemo(
    () => currencies?.map((it) => it.address) ?? [],
    [currencies]
  );
  const queryKey = useQueryKey();
  return useQuery<Balances>({
    queryKey,
    queryFn: () => fetchBalances(chainId, address, addresses),
    enabled: !!chainId && !!address && addresses.length > 0,
    refetchInterval: 60_000,
    staleTime: 60_000,
    gcTime: Infinity,
  });
};

export const useRefetchSelectedCurrenciesBalances = () => {
  const queryClient = useQueryClient();
  const chainId = useActiveChainId();
  const { address } = useConnection();
  const { inputCurrency, outputCurrency } = useDerivedSwap();
  const queryKey = useQueryKey();
  return useMutation({
    mutationFn: async (additionalAddresses: string[]) => {
      const addresses = uniqueTokenAddresses([
        inputCurrency?.address,
        outputCurrency?.address,
        ...additionalAddresses,
      ]);
      const newBalances = await fetchBalances(chainId, address, addresses);
      // Refresh selected assets without discarding cached balances for the token list.
      queryClient.setQueryData<Balances>(
        queryKey,
        (prevBalances) => {
          if (!prevBalances) return newBalances;
          return { ...prevBalances, ...newBalances };
        }
      );
    },
  });
};

export const useBalance = (currency?: Currency) => {
  const { data: balances, isLoading, refetch } = useBalances();
  const balance = useMemo(() => {
    return balances?.[currency?.address ?? ""];
  }, [balances, currency]);

  const ui = useToAmountUI(currency?.decimals, balance);

  return {
    ui,
    wei: balance,
    formatted: useFormatNumber({ value: ui }),
    isLoading,
    refetch,
  };
};

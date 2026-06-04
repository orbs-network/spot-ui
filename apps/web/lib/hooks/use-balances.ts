import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo } from "react";
import { useFormatNumber, useToAmountUI } from "./common";
import { Currency } from "../types";
import { useCurrenciesQuery } from "./use-currencies-query";
import { useDerivedSwap } from "./use-derived-swap";
import { useUtilaWalletSession } from "./use-utila-wallet-session";

const getBalancesAddressesKey = (addresses: string[]) =>
  [...addresses]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .join(",");

export const getBalancesQueryKey = (
  chainId?: number,
  address?: string,
  addresses: string[] = [],
) => ["balances", chainId, address, getBalancesAddressesKey(addresses)];

export const fetchBalances = async ({
  address,
  chainId,
  tokens,
}: {
  address?: string;
  chainId?: number;
  tokens: string[];
}) => {
  const response = await axios.post("/api/balances", {
    chainId,
    address,
    tokens,
  });

  return response.data as Record<string, string>;
};

const useQueryKey = (disabled = false) => {
  const { address, chainId } = useUtilaWalletSession();
  const { data: currencies } = useCurrenciesQuery({ disabled });
  const addresses = useMemo(
    () => currencies?.map((it) => it.address) ?? [],
    [currencies],
  );
  return useMemo(
    () => getBalancesQueryKey(chainId, address, addresses),
    [chainId, address, addresses],
  );
};

export const useBalances = ({
  disabled = false,
}: { disabled?: boolean } = {}) => {
  const { address, chainId } = useUtilaWalletSession();
  const { data: currencies } = useCurrenciesQuery({ disabled });
  const addresses = useMemo(
    () => currencies?.map((it) => it.address) ?? [],
    [currencies],
  );
  const queryKey = useQueryKey(disabled);
  return useQuery<Record<string, string>>({
    queryKey,
    queryFn: () => fetchBalances({ address, chainId, tokens: addresses }),
    enabled: !disabled && !!chainId && !!address && addresses.length > 0,
    refetchInterval: 60_000,
    staleTime: 60_000,
    gcTime: Infinity,
  });
};

export const useRefetchSelectedCurrenciesBalances = () => {
  const queryClient = useQueryClient();
  const { address, chainId } = useUtilaWalletSession();
  const { inputCurrency, outputCurrency } = useDerivedSwap();
  const queryKey = useQueryKey();
  return useMutation({
    mutationFn: async () => {
      const addresses = [inputCurrency?.address, outputCurrency?.address].filter(
        (address): address is string => Boolean(address),
      );
      const newBalances = await fetchBalances({
        address,
        chainId,
        tokens: addresses,
      });
      queryClient.setQueryData<Record<string, string>>(
        queryKey,
        (prevBalances) => {
          if (!prevBalances) return newBalances;
          return { ...prevBalances, ...newBalances };
        },
      );
    },
  });
};

export const useBalance = (currency?: Currency) => {
  const { data: balances, isLoading, refetch } = useBalances({
    disabled: !currency,
  });
  const balance = useMemo(() => {
    return balances?.[currency?.address ?? ""];
  }, [balances, currency]);

  const ui = useToAmountUI(currency?.decimals, balance);

  return {
    ui: useToAmountUI(currency?.decimals, balance),
    wei: balance,
    formatted: useFormatNumber({ value: ui }),
    isLoading,
    refetch,
  };
};

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import axios from "axios";
import { useMemo } from "react";
import { useFormatNumber, useToAmountUI } from "./common";
import { Currency } from "../types";
import { useCurrenciesQuery } from "./use-currencies-query";
import { useDerivedSwap } from "./use-derived-swap";

const useQueryKey = () => {
  const { chainId, address } = useConnection();
  const { data: currencies } = useCurrenciesQuery();
  const addresses = useMemo(
    () => currencies?.map((it) => it.address) ?? [],
    [currencies]
  );
  return useMemo(
    () => ["balances", chainId, address, addresses.join(",") ?? ""],
    [chainId, address, addresses]
  );
};

export const useBalances = () => {
  const { chainId, address } = useConnection();
  const { data: currencies } = useCurrenciesQuery();
  const addresses = useMemo(
    () => currencies?.map((it) => it.address) ?? [],
    [currencies]
  );
  const queryKey = useQueryKey();
  return useQuery<Record<string, string>>({
    queryKey,
    queryFn: async () => {
      const response = await axios.post("/api/balances", {
        chainId,
        address,
        tokens: addresses,
      });

      return response.data;
    },
    enabled: !!chainId && !!address && !!addresses && addresses.length > 0,
    refetchInterval: 60_000,
    staleTime: Infinity,
    gcTime: Infinity,
  });
};

export const useRefetchSelectedCurrenciesBalances = () => {
  const queryClient = useQueryClient();
  const { chainId, address } = useConnection();
  const { inputCurrency, outputCurrency } = useDerivedSwap();
  const queryKey = useQueryKey();
  return useMutation({
    mutationFn: async () => {
      const addresses = [inputCurrency?.address, outputCurrency?.address].filter(Boolean);
      const response = await axios.post("/api/balances", {
        chainId,
        address,
        tokens: addresses,
      });
      const newBalances = response.data;
      queryClient.setQueryData<Record<string, string>>(
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
    ui: useToAmountUI(currency?.decimals, balance),
    wei: balance,
    formatted: useFormatNumber({ value: ui }),
    isLoading,
    refetch,
  };
};

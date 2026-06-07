import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo } from "react";
import { useFormatNumber, useToAmountUI } from "./common";
import { Currency } from "../types";
import { useDerivedSwap } from "./use-derived-swap";
import { useActiveConnection } from "./use-active-connection";

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
  if (!address || !chainId || tokens.length === 0) {
    return {};
  }

  const response = await axios.post("/api/balances", {
    chainId,
    address,
    tokens,
  });

  return response.data as Record<string, string>;
};

export const useBalances = ({
  addresses: requestedAddresses,
  disabled = false,
}: {
  addresses?: string[];
  disabled?: boolean;
} = {}) => {
  const { address, chainId } = useActiveConnection();
  const addresses = useMemo(
    () =>
      [...new Set((requestedAddresses ?? []).filter(Boolean))].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      ),
    [requestedAddresses],
  );

  const queryKey = useMemo(
    () => getBalancesQueryKey(chainId, address, addresses),
    [address, addresses, chainId],
  );

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
  const { address, chainId } = useActiveConnection();
  const { inputCurrency, outputCurrency } = useDerivedSwap();
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
        getBalancesQueryKey(chainId, address, addresses),
        (prevBalances) => {
          if (!prevBalances) return newBalances;
          return { ...prevBalances, ...newBalances };
        },
      );
      addresses.forEach((tokenAddress) => {
        queryClient.setQueryData<Record<string, string>>(
          getBalancesQueryKey(chainId, address, [tokenAddress]),
          (prevBalances) => ({
            ...(prevBalances ?? {}),
            [tokenAddress]: newBalances[tokenAddress] ?? "0",
          }),
        );
      });
    },
  });
};

export const useBalance = (currency?: Currency) => {
  const currencyAddress = currency?.address;
  const addresses = useMemo(
    () => (currencyAddress ? [currencyAddress] : []),
    [currencyAddress],
  );
  const { data: balances, isLoading, refetch } = useBalances({
    addresses,
    disabled: !currency,
  });
  const balance = useMemo(() => {
    return balances?.[currencyAddress ?? ""];
  }, [balances, currencyAddress]);

  const ui = useToAmountUI(currency?.decimals, balance);

  return {
    ui: useToAmountUI(currency?.decimals, balance),
    wei: balance,
    formatted: useFormatNumber({ value: ui }),
    isLoading,
    refetch,
  };
};

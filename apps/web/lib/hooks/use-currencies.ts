import { useMemo } from "react";
import { filterCurrencies, sortTokens } from "../utils";
import { erc20Abi, isAddress } from "viem";
import { useReadContracts } from "wagmi";
import { useBalances } from "./use-balances";
import { Currency } from "../types";
import { useCurrenciesQuery } from "./use-currencies-query";

const useExternalCurrency = (address?: `0x${string}`) => {
  const { data: externalCurrency } = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        address,
        abi: erc20Abi,
        functionName: "decimals",
      },
      {
        address,
        abi: erc20Abi,
        functionName: "name",
      },
      {
        address,
        abi: erc20Abi,
        functionName: "symbol",
      },
    ],
  });

  return useMemo((): Currency | undefined => {
    if (!externalCurrency) return undefined;
    return {
      decimals: externalCurrency[0] ?? 0,
      name: externalCurrency[1] ?? "",
      symbol: externalCurrency[2] ?? "",
      address: address ?? "",
      logoUrl: "",
      imported: true,
    };
  }, [externalCurrency, address]);
};

const useAllCurrencies = () => {
  const { data: currencies, isLoading } = useCurrenciesQuery();

  const { data: balances } = useBalances();

  const result = useMemo(() => {
    if (!currencies) return [];
    return sortTokens(currencies, balances);
  }, [currencies, balances]);

  return {
    currencies: result,
    isLoading,
  };
};

export const useCurrencies = (query?: string) => {
  const { currencies, isLoading } = useAllCurrencies();
  const internalCurrencies = useMemo(() => {
    if (!query) return currencies;
    return filterCurrencies(currencies, [query]);
  }, [currencies, query]);

  const allowExternal =
    query && !internalCurrencies?.length && isAddress(query);

  const externalCurrency = useExternalCurrency(
    allowExternal ? query : undefined
  );

  const result = useMemo(() => {
    if (externalCurrency) {
      return [externalCurrency];
    }
    return internalCurrencies;
  }, [externalCurrency, internalCurrencies]);

  return {
    currencies: result,
    isLoading,
  };
};

export const useCurrency = (address?: string) => {
  const { currencies } = useCurrencies(address);
  return useMemo(() => {
    return currencies?.[0];
  }, [currencies]);
};

import { useMemo } from "react";
import BN from "bignumber.js";
import { filterCurrencies, sortTokens } from "../utils";
import { erc20Abi, isAddress } from "viem";
import { useReadContracts } from "wagmi";
import { useBalances } from "./use-balances";
import { useUSDPrices } from "./use-usd-price";
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

const useAllCurrencies = ({
  disabled = false,
}: { disabled?: boolean } = {}) => {
  const { data: currencies, isLoading } = useCurrenciesQuery({ disabled });

  const { data: balances } = useBalances({ disabled });

  const tokensWithBalance = useMemo(
    () =>
      currencies
        ?.filter((it) => {
          const raw = balances?.[it.address] ?? "0";
          return new BN(raw.toString()).gt(0);
        })
        .map((it) => it.address) ?? [],
    [currencies, balances],
  );

  const { data: usdPrices } = useUSDPrices(
    tokensWithBalance,
    disabled || tokensWithBalance.length === 0,
  );

  const result = useMemo(() => {
    if (disabled || !currencies) return [];

    const sorted = sortTokens(currencies, usdPrices, balances);

    return sorted;
  }, [currencies, balances, usdPrices, disabled]);

  return {
    currencies: result,
    isLoading: disabled ? false : isLoading,
  };
};

export const useCurrencies = (
  query?: string,
  { disabled = false }: { disabled?: boolean } = {},
) => {
  const { currencies, isLoading } = useAllCurrencies({ disabled });
  const internalCurrencies = useMemo(() => {
    if (disabled || !query) return currencies;
    return filterCurrencies(currencies, [query]);
  }, [currencies, disabled, query]);

  const allowExternal =
    !disabled && query && !internalCurrencies?.length && isAddress(query);

  const externalCurrency = useExternalCurrency(
    allowExternal ? query : undefined,
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
  const { data: currencies } = useCurrenciesQuery({ disabled: !address });
  const internalCurrency = useMemo(() => {
    if (!address || !currencies) return undefined;

    return currencies.find(
      (currency) => currency.address.toLowerCase() === address.toLowerCase(),
    );
  }, [address, currencies]);
  const externalCurrency = useExternalCurrency(
    address && currencies && !internalCurrency && isAddress(address)
      ? address
      : undefined,
  );

  return useMemo(() => {
    return internalCurrency ?? externalCurrency;
  }, [externalCurrency, internalCurrency]);
};

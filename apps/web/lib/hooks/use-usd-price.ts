import { useQuery } from "@tanstack/react-query";
import { getUSDPrice } from "../get-usd-price";
import { useConnection } from "wagmi";
import BN from "bignumber.js";
import { useMemo } from "react";
import { useFormatNumber } from "./common";

export const useUSDPrices = (
  tokens?: Array<string | undefined>,
  disabled?: boolean,
) => {
  const { chainId } = useConnection();
  const tokenKey = useMemo(
    () => (tokens ?? []).filter(Boolean).join(","),
    [tokens],
  );
  const normalizedTokens = useMemo(
    () => tokenKey.split(",").filter(Boolean),
    [tokenKey],
  );
  const enabled = normalizedTokens.length > 0 && !!chainId && !disabled;
  const query = useQuery({
    queryKey: ["usd-price", tokenKey, chainId],
    queryFn: async () => {
      const response = await getUSDPrice(normalizedTokens, chainId!);
      return response;
    },
    enabled,
    staleTime: Infinity,
  });

  return {
    ...query,
    isLoading: enabled ? query.isLoading : false,
  };
};

export const useUSDPrice = ({
  token,
  amount = "1",
  disabled,

}: {
  token?: string;
  amount?: string;
  disabled?: boolean;
}) => {
  const { data: usdPrices, isLoading, isError } = useUSDPrices(
    token ? [token] : [],
    disabled,
  );
  const data = useMemo(() => {
    return BN(usdPrices?.[token!] ?? 0)
      .multipliedBy(amount ?? 0)
      .decimalPlaces(6)
      .toNumber();
  }, [usdPrices, token, amount]);

  const usdFormatted = useFormatNumber({ value: data, decimalScale: 2 });

  return {
    data,
    formatted: usdFormatted,
    isLoading,
    isError,
  };
};

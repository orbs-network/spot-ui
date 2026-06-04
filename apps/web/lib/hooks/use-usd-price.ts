import { useQuery } from "@tanstack/react-query";
import { getUSDPrice } from "../get-usd-price";
import BN from "bignumber.js";
import { useMemo } from "react";
import { useFormatNumber } from "./common";
import { useUtilaWalletSession } from "./use-utila-wallet-session";

export const useUSDPrices = (tokens?: string[], disabled?: boolean) => {
  const { chainId } = useUtilaWalletSession();
  return useQuery({
    queryKey: ["usd-price", tokens?.join(",") ?? "", chainId],
    queryFn: async () => {
      const response = await getUSDPrice(tokens!, chainId!);
      return response;
    },
    enabled: !!tokens && tokens.length > 0 && !!chainId && !disabled,
    staleTime: Infinity,
  });
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
    disabled || !token,
  );
  const data = useMemo(() => {
    return BN(usdPrices?.[token ?? ""] ?? 0)
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

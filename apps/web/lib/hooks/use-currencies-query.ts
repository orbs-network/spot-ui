import { useQuery } from "@tanstack/react-query";
import { getCurrencies } from "../get-currencies";
import { useUserStore } from "./store";
import { useUtilaWalletSession } from "./use-utila-wallet-session";

export function useCurrenciesQuery({
  disabled = false,
}: { disabled?: boolean } = {}) {
  const { chainId = 56 } = useUtilaWalletSession();
  const { customCurrencies } = useUserStore();

  return useQuery({
    queryKey: ["currencies", chainId],
    queryFn: async () => {
      try {
        const currencies = await getCurrencies(chainId!);
        const customCurrenciesList = customCurrencies[chainId ?? 0] ?? [];
        return [...currencies, ...customCurrenciesList];
      } catch (error) {
        console.error("Error fetching currencies:", error);
        throw error;
      }
    },
    enabled: !disabled,
    staleTime: 1000 * 60 * 60 * 24,
  });
}

import { useQuery } from "@tanstack/react-query";
import { getCurrencies } from "../get-currencies";
import { useUserStore } from "./store";
import { useSwapParams } from "./use-swap-params";

export function useCurrenciesQuery({
  disabled = false,
}: { disabled?: boolean } = {}) {
  const { chainId } = useSwapParams();
  const { customCurrencies } = useUserStore();

  return useQuery({
    queryKey: ["currencies", chainId],
    queryFn: async () => {
      if (!chainId) {
        return [];
      }

      try {
        const currencies = await getCurrencies(chainId);
        const customCurrenciesList = customCurrencies[chainId ?? 0] ?? [];
        return [...currencies, ...customCurrenciesList];
      } catch (error) {
        console.error("Error fetching currencies:", error);
        throw error;
      }
    },
    enabled: !disabled && Boolean(chainId),
    staleTime: 1000 * 60 * 60 * 24,
  });
}

import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";
import { useQuery } from "@tanstack/react-query";
import { getCurrencies } from "../get-currencies";
import { useUserStore } from "./store";

export function useCurrenciesQuery() {
    const chainId = useActiveChainId();
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
      staleTime: 1000 * 60 * 60 * 24,
    });
  }


  
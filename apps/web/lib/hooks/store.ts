import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Currency } from "../types";
import { DEFAULT_PRICE_PROTECTION, DEFAULT_SLIPPAGE } from "../consts";

type CustomCurrencies = { [chainId: number]: Currency[] };

type UserStore = {
  slippage: number;
  setSlippage: (slippage: number) => void;
  priceProtection: number;
  setPriceProtection: (priceProtection: number) => void;
  customCurrencies: CustomCurrencies;
  setCustomCurrency: (chainId: number, currency: Currency) => void;
};

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      slippage: DEFAULT_SLIPPAGE,
      priceProtection: DEFAULT_PRICE_PROTECTION,
      customCurrencies: {},
      setCustomCurrency: (chainId: number, currency: Currency) =>
        set((state) => ({
          customCurrencies: {
            ...state.customCurrencies,
            [chainId]: (state.customCurrencies[chainId] ?? []).filter(it => it.address !== currency.address).concat(currency),
          },
        })),
      setSlippage: (slippage: number) => set({ slippage }),
      setPriceProtection: (priceProtection: number) => set({ priceProtection }),
    }),
    {
      name: "swap-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

type SwapStore = {
  inputAmount: string;
  setInputAmount: (inputAmount: string) => void;
  pauseQuote: boolean;
  setPauseQuote: (pauseQuote: boolean) => void;
};

export const useSwapStore = create<SwapStore>((set) => ({
  inputAmount: "",
  setInputAmount: (inputAmount: string) => set({ inputAmount }),
  pauseQuote: false,
  setPauseQuote: (pauseQuote: boolean) => set({ pauseQuote }),
}));

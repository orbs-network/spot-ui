import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Currency, Field } from "../types";
import { DEFAULT_PRICE_PROTECTION, DEFAULT_SLIPPAGE } from "../consts";

type CustomCurrencies = { [chainId: number]: Currency[] };

type UserStore = {
  slippage: number;
  isCustomSlippage: boolean;
  setSlippage: (slippage: number) => void;
  resetSlippage: () => void;
  priceProtection: number;
  setPriceProtection: (priceProtection: number) => void;
  customCurrencies: CustomCurrencies;
  setCustomCurrency: (chainId: number, currency: Currency) => void;
};

const normalizeSlippage = (slippage: unknown): number | undefined => {
  if (typeof slippage !== "number" || !Number.isFinite(slippage) || slippage < 0 || slippage > 50) {
    return undefined;
  }
  return Math.round(slippage * 100) / 100;
};

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      slippage: DEFAULT_SLIPPAGE,
      isCustomSlippage: false,
      priceProtection: DEFAULT_PRICE_PROTECTION,
      customCurrencies: {},
      setCustomCurrency: (chainId: number, currency: Currency) =>
        set((state) => ({
          customCurrencies: {
            ...state.customCurrencies,
            [chainId]: (state.customCurrencies[chainId] ?? []).filter(it => it.address !== currency.address).concat(currency),
          },
        })),
      setSlippage: (slippage: number) => {
        const normalizedSlippage = normalizeSlippage(slippage);
        if (normalizedSlippage === undefined) return;
        set(normalizedSlippage > 0
          ? { slippage: normalizedSlippage, isCustomSlippage: true }
          : { slippage: DEFAULT_SLIPPAGE, isCustomSlippage: false });
      },
      resetSlippage: () => set({ slippage: DEFAULT_SLIPPAGE, isCustomSlippage: false }),
      setPriceProtection: (priceProtection: number) => set({ priceProtection }),
    }),
    {
      name: "swap-store",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persistedState) => {
        const settings = persistedState as Partial<UserStore>;
        const slippage = normalizeSlippage(settings?.slippage);
        const hasCustomValue = slippage !== undefined && slippage > 0;
        return {
          ...settings,
          slippage: hasCustomValue ? slippage : DEFAULT_SLIPPAGE,
          isCustomSlippage: hasCustomValue
            ? typeof settings.isCustomSlippage === "boolean"
              ? settings.isCustomSlippage
              : slippage !== DEFAULT_SLIPPAGE
            : false,
        };
      },
    }
  )
);

type SwapStore = {
  inputAmount: string;
  outputAmount: string;
  independentField: Field;
  setInputAmount: (inputAmount: string) => void;
  setOutputAmount: (outputAmount: string) => void;
  pauseQuote: boolean;
  setPauseQuote: (pauseQuote: boolean) => void;
};

export const useSwapStore = create<SwapStore>((set) => ({
  inputAmount: "",
  outputAmount: "",
  independentField: Field.INPUT,
  setInputAmount: (inputAmount: string) => set({ inputAmount, outputAmount: "", independentField: Field.INPUT }),
  setOutputAmount: (outputAmount: string) => set({ outputAmount, inputAmount: "", independentField: Field.OUTPUT }),
  pauseQuote: false,
  setPauseQuote: (pauseQuote: boolean) => set({ pauseQuote }),
}));

import { Step, SwapStatus } from "@orbs-network/swap-ui";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Currency, SwapStep } from "../types";
import { DEFAULT_PRICE_PROTECTION, DEFAULT_SLIPPAGE } from "../consts";
import { useEffect } from "react";

type CustomCurrencies = { [chainId: number]: Currency[] };

type UserStore = {
  slippage: number;
  setSlippage: (slippage: number) => void;
  priceProtection: number;
  setPriceProtection: (priceProtection: number) => void;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
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
      _hasHydrated: false,
      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
    }),
    {
      name: "swap-store",
      storage: createJSONStorage(() => localStorage),
      // Skip automatic hydration to prevent SSR mismatch
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Hook to handle hydration - call this in your root component
export const useHydrateStores = () => {
  useEffect(() => {
    useUserStore.persist.rehydrate();
  }, []);
};

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

type BestTradeSwapStore = {
  status?: SwapStatus;
  totalSteps?: number;
  currentStep?: SwapStep;
  currentStepIndex?: number;
  txHash?: string;
  updateStore: (data: Partial<BestTradeSwapStore>) => void;
  resetStore: () => void;
};

export const useBestTradeSwapStore = create<BestTradeSwapStore>((set) => ({
  updateStore: (data: Partial<BestTradeSwapStore>) =>
    set((state) => ({ ...state, ...data })),
  resetStore: () =>
    set({
      status: undefined,
      totalSteps: undefined,
      currentStep: undefined,
      currentStepIndex: undefined,
      txHash: undefined,
    }),
}));

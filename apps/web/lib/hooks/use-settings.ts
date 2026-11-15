import { DEFAULT_PRICE_PROTECTION, DEFAULT_SLIPPAGE } from "../consts";
import { useUserStore } from "./store";

export const useSettings = () => {
  const {
    slippage = DEFAULT_SLIPPAGE,
    isCustomSlippage,
    setSlippage,
    resetSlippage,
    priceProtection = DEFAULT_PRICE_PROTECTION,
    setPriceProtection,
  } = useUserStore();
  return { slippage, isCustomSlippage, setSlippage, resetSlippage, priceProtection, setPriceProtection };
};

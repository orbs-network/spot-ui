import { Module } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useDefaultLimitPricePercent } from "./use-default-values";
import { useDstMinAmountPerTrade } from "./use-dst-amount";
import { useInvertTradePanel } from "./use-invert-trade-panel";
import { useLimitPrice, useLimitPriceToggle } from "./use-limit-price";
import { useTranslations } from "./use-translations";
import { useTrades } from "./use-trades";

export const useLimitPricePanel = () => {
    const { module, marketPriceLoading } = useSpotContext();
    const t = useTranslations();
    const { amountUI, onChange, onPercentageChange, usd, selectedPercentage, error } = useLimitPrice();
  
    const updateState = useSpotStore((s) => s.updateState);
    const defaultLimitPricePercent = useDefaultLimitPricePercent();
    const { isLimitPrice, toggleLimitPrice } = useLimitPriceToggle();
    const { isInverted, onInvert, fromToken, toToken } = useInvertTradePanel();
  
  
    const reset = useCallback(() => {
      updateState({ typedLimitPrice: undefined });
      updateState({ limitPricePercent: defaultLimitPricePercent });
    }, [updateState, module, defaultLimitPricePercent]);
  
    const tooltip = useMemo(() => {
      if (module === Module.STOP_LOSS) {
        return t("stopLossLimitPriceTooltip");
      }
      return t("limitPriceTooltip");
    }, [t, module]);
  
    return {
      price: amountUI,
      amountPerChunk: useDstMinAmountPerTrade().amountUI,
      error,
      label: t("limitPrice"),
      tooltip,
      onChange,
      onPercentageChange,
      onReset: reset,
      usd,
      fromToken,
      tradesAmount: useTrades().totalTrades,
      toToken,
      percentage: selectedPercentage,
      isInverted,
      isLoading: marketPriceLoading,
      isLimitPrice,
      toggleLimitPrice,
      onInvert,
    };
  };
  
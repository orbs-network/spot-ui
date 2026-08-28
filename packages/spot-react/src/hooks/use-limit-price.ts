import { useCallback, useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useInputWithPercentage } from "./use-input-with-percentage";
import { Module } from "../types";
import BN from "bignumber.js";
import { useTriggerPrice } from "./use-trigger-price";
import { useDefaultLimitPricePercent } from "./use-default-values";
import { useAmountUi, useUsdAmount } from "./helper-hooks";
import { validateLimitPrice } from "../price-validation";


export const useLimitPriceError = (limitPriceWei?: string) => {
  const { module, marketPrice } = useSpotContext();
  const { amount: triggerPrice } = useTriggerPrice();

  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  return useMemo(
    () =>
      validateLimitPrice({
        marketPrice,
        triggerPrice,
        limitPrice: limitPriceWei,
        isMarketOrder: Boolean(isMarketOrder),
        module,
      }),
    [isMarketOrder, limitPriceWei, marketPrice, module, triggerPrice],
  );
};

export const useLimitPrice = () => {
  const { dstToken, dstUsd1Token, marketPrice, callbacks } = useSpotContext();
  const updateState = useSpotStore((s) => s.updateState);
  const defaultLimitPricePercent = useDefaultLimitPricePercent();
  const typedPercent = useSpotStore((s) => s.state.limitPricePercent);
  const percentage = typedPercent === undefined ? defaultLimitPricePercent : typedPercent;

  const result = useInputWithPercentage({
    typedValue: useSpotStore((s) => s.state.typedLimitPrice),
    percentage,
    tokenDecimals: dstToken?.decimals || 18,
    initialPrice: marketPrice,
    setValue: useCallback((typedLimitPrice?: string) => {
      updateState({ typedLimitPrice });
      callbacks?.onLimitPriceChange?.(typedLimitPrice || "");
    }, [updateState, callbacks]),
    setPercentage: useCallback(
      (limitPricePercent?: string | null) => {
        updateState({ limitPricePercent });
        callbacks?.onLimitPricePercentChange?.(limitPricePercent || "");
      },
      [updateState, callbacks],
    ),
  });

  const error = useLimitPriceError(result.amount);
  const amountUI = useAmountUi(dstToken?.decimals || 18, result.amount);
  const usd = useUsdAmount(amountUI, dstUsd1Token);

  return useMemo(() => {
    return {
      ...result,
      amountUI: BN(amountUI).isNaN() ? "" : amountUI,
      usd: BN(usd).isNaN() ? "" : usd,
      error,
    };
  }, [result, amountUI, usd, error]);
};

export const useLimitPriceToggle = () => {
  const { module } = useSpotContext();
  const updateState = useSpotStore((s) => s.updateState);
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  const defaultLimitPricePercent = useDefaultLimitPricePercent();
  const triggerPricePercent = useSpotStore((s) => s.state.triggerPricePercent) || 0;
  const hide = module === Module.LIMIT;

  const toggleLimitPrice = useCallback(() => {
    if (!isMarketOrder && module === Module.STOP_LOSS) {
      updateState({ limitPricePercent: defaultLimitPricePercent });
    }

    updateState({ isMarketOrder: !isMarketOrder });
  }, [updateState, triggerPricePercent, module, isMarketOrder, defaultLimitPricePercent]);

  return {
    isLimitPrice: !isMarketOrder,
    toggleLimitPrice,
    hide,
  };
};

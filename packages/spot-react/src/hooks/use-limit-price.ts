import { useCallback, useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useInputWithPercentage } from "./use-input-with-percentage";
import { InputErrors, InputError, Module } from "../types";
import BN from "bignumber.js";
import { useTriggerPrice } from "./use-trigger-price";
import { useDefaultLimitPricePercent } from "./use-default-values";
import { getStopLossLimitPriceError, getTakeProfitLimitPriceError } from "@orbs-network/spot-ui";
import { useTranslations } from "./use-translations";


export const useLimitPriceError = (limitPriceWei?: string) => {
  const { module, marketPrice, typedInputAmount } = useSpotContext();
  const t = useTranslations();
  const { amountWei: triggerPrice } = useTriggerPrice();

  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);
  return useMemo((): InputError | undefined => {
    if (BN(typedInputAmount || "0").isZero() || !triggerPrice || !marketPrice) return;
    const _stopLossError = getStopLossLimitPriceError(triggerPrice, limitPriceWei, isMarketOrder, module);
    const _takeProfitError = getTakeProfitLimitPriceError(triggerPrice, limitPriceWei, isMarketOrder, module);

    if (_stopLossError?.isError) {
      return {
        type: InputErrors.TRIGGER_LIMIT_PRICE_GREATER_THAN_TRIGGER_PRICE,
        message: t("triggerLimitPriceError") || "",
        value: _stopLossError.value,
      };
    }

    if (_takeProfitError?.isError) {
      return {
        type: InputErrors.TRIGGER_LIMIT_PRICE_GREATER_THAN_TRIGGER_PRICE,
        message: t("triggerLimitPriceError") || "",
        value: _takeProfitError.value,
      };
    }

    if (limitPriceWei && BN(limitPriceWei || 0).isZero()) {
      return {
        type: InputErrors.MISSING_LIMIT_PRICE,
        message: t("emptyLimitPrice") || "",
        value: limitPriceWei || "",
      };
    }
  }, [limitPriceWei, t, triggerPrice, module, isMarketOrder, typedInputAmount, marketPrice]);
};

export const useLimitPrice = () => {
  const { dstToken, marketPrice, callbacks } = useSpotContext();
  const updateState = useSpotStore((s) => s.updateState);
  const defaultLimitPricePercent = useDefaultLimitPricePercent();
  const typedPercent = useSpotStore((s) => s.state.limitPricePercent);
  const percentage = typedPercent === undefined ? defaultLimitPricePercent : typedPercent;

  const result = useInputWithPercentage({
    typedValue: useSpotStore((s) => s.state.typedLimitPrice),
    percentage,
    tokenDecimals: dstToken?.decimals,
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

  const error = useLimitPriceError(result.amountWei);

  return useMemo(() => {
    return {
      ...result,
      error,
    };
  }, [result, error]);
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

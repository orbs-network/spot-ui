import { useCallback, useMemo } from "react";
import BN from "bignumber.js";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useInputWithPercentage } from "./use-input-with-percentage";
import { Module } from "../types";
import { useDefaultTriggerPricePercent } from "./use-default-values";
import { getStopLossPriceError, getTakeProfitPriceError, getTriggerPricePerChunk, InputErrors } from "@orbs-network/spot-ui";
import { useAmountUi, useUsdAmount } from "./helper-hooks";
import { useTrades } from "./use-trades";
import { useTranslations } from "./use-translations";

const useTriggerPriceError = (triggerPriceWei = "") => {
  const { module, marketPrice, typedInputAmount } = useSpotContext();
  const t = useTranslations();


  return useMemo(() => {
    if (BN(typedInputAmount || "0").isZero() || !marketPrice) return;
    if (module !== Module.STOP_LOSS && module !== Module.TAKE_PROFIT) return;
    const stopLossError = getStopLossPriceError(marketPrice || "", triggerPriceWei || "", module);
    if (stopLossError?.isError) {
      return {
        type: InputErrors.STOP_LOSS_TRIGGER_PRICE_GREATER_THAN_MARKET_PRICE,
        value: stopLossError.value,
        message: t("StopLossTriggerPriceError") || "",
      };
    }
    const takeProfitError = getTakeProfitPriceError(marketPrice || "", triggerPriceWei || "", module);

    if (takeProfitError?.isError) {
      return {
        type: InputErrors.TAKE_PROFIT_TRIGGER_PRICE_LESS_THAN_MARKET_PRICE,
        value: takeProfitError.value,
        message: t("TakeProfitTriggerPriceError") || "",
      };
    }

    if (!triggerPriceWei || BN(triggerPriceWei || 0).isZero()) {
      return {
        type: InputErrors.EMPTY_TRIGGER_PRICE,
        value: triggerPriceWei,
        message: t("emptyTriggerPrice") || "",
      };
    }
  }, [marketPrice, triggerPriceWei, module, t, typedInputAmount]);
};

export const useTriggerAmountPerChunk = (triggerPrice?: string) => {
  const { srcToken, dstToken, module, dstUsd1Token } = useSpotContext();
  const amountPerTrade = useTrades().amountPerTradeWei;
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);

  const result = useMemo(() => {
    return getTriggerPricePerChunk(module, amountPerTrade, triggerPrice, srcToken?.decimals || 0);
  }, [triggerPrice, amountPerTrade, isMarketOrder, srcToken?.decimals, module]);

  
  const amountUI = useAmountUi(dstToken?.decimals || 0, result);

  return {
    amountWei: result,
    amountUI: amountUI,
    usd: useUsdAmount(amountUI, dstUsd1Token),
  };
};

export const useTriggerPrice = () => {
  const { dstToken, marketPrice, module, callbacks } = useSpotContext();
  const updateState = useSpotStore((s) => s.updateState);
  const defaultTriggerPricePercent = useDefaultTriggerPricePercent();
  const typedPercent = useSpotStore((s) => s.state.triggerPricePercent);

  const percentage = typedPercent === undefined ? defaultTriggerPricePercent : typedPercent;
  const enabled = module === Module.STOP_LOSS || module === Module.TAKE_PROFIT;

  const result = useInputWithPercentage({
    typedValue: useSpotStore((s) => s.state.typedTriggerPrice),
    percentage,
    tokenDecimals: dstToken?.decimals || 18,
    initialPrice: enabled ? marketPrice : undefined,
    setValue: useCallback((typedTriggerPrice?: string) => {
      updateState({ typedTriggerPrice });
      callbacks?.onTriggerPriceChange?.(typedTriggerPrice || "");
    }, [updateState, callbacks]),
    setPercentage: useCallback(
      (triggerPricePercent?: string | null) => {
        updateState({ triggerPricePercent });
        callbacks?.onTriggerPricePercentChange?.(triggerPricePercent || "");
      },
      [updateState, callbacks],
    ),
  });
  const error = useTriggerPriceError(result.amountWei);
  const { amountWei: triggerAmountPerChunk, amountUI: triggerAmountPerChunkUI,usd: triggerAmountPerChunkUsd } = useTriggerAmountPerChunk(result.amountWei);

  return useMemo(() => {
    return {
      ...result,
      error,
      pricePerChunkWei: triggerAmountPerChunk,
      pricePerChunkUI: triggerAmountPerChunkUI,
      pricePerChunkUsd: triggerAmountPerChunkUsd,
    };
  }, [result, error, triggerAmountPerChunk, triggerAmountPerChunkUI, triggerAmountPerChunkUsd]);
};


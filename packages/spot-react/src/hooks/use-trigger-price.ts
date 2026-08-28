import { useCallback, useMemo } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { useInputWithPercentage } from "./use-input-with-percentage";
import { Module } from "../types";
import { useDefaultTriggerPricePercent } from "./use-default-values";
import { getTriggerPricePerChunk } from "@orbs-network/spot-ui";
import { useAmountUi, useUsdAmount } from "./helper-hooks";
import { useTrades } from "./use-trades";
import { validateTriggerPrice } from "../price-validation";
import BN from "bignumber.js";

const useTriggerPriceError = (triggerPriceWei = "") => {
  const { module, marketPrice } = useSpotContext();

  return useMemo(
    () =>
      validateTriggerPrice({
        marketPrice,
        triggerPrice: triggerPriceWei,
        module,
      }),
    [marketPrice, module, triggerPriceWei],
  );
};

export const useTriggerAmountPerChunk = (triggerPrice?: string) => {
  const { srcToken, dstToken, module, dstUsd1Token } = useSpotContext();
  const amountPerTrade = useTrades().amountPerTrade;
  const isMarketOrder = useSpotStore((s) => s.state.isMarketOrder);

  const result = useMemo(() => {
    return getTriggerPricePerChunk(module, amountPerTrade, triggerPrice, srcToken?.decimals || 0);
  }, [triggerPrice, amountPerTrade, isMarketOrder, srcToken?.decimals, module]);

  
  const amountUI = useAmountUi(dstToken?.decimals || 0, result);

  return {
    amount: result,
    amountUI: amountUI,
    usd: useUsdAmount(amountUI, dstUsd1Token),
  };
};

export const useTriggerPrice = () => {
  const { dstToken, dstUsd1Token, marketPrice, module, callbacks } = useSpotContext();
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
  const error = useTriggerPriceError(result.amount);
  const amountUI = useAmountUi(dstToken?.decimals || 18, result.amount);
  const usd = useUsdAmount(amountUI, dstUsd1Token);
  const { amount: triggerAmountPerChunk, amountUI: triggerAmountPerChunkUI,usd: triggerAmountPerChunkUsd } = useTriggerAmountPerChunk(result.amount);

  return useMemo(() => {
    return {
      ...result,
      amountUI: BN(amountUI).isNaN() ? "" : amountUI,
      usd: BN(usd).isNaN() ? "" : usd,
      error,
      pricePerChunk: triggerAmountPerChunk,
      pricePerChunkUI: triggerAmountPerChunkUI,
      pricePerChunkUsd: triggerAmountPerChunkUsd,
    };
  }, [result, amountUI, usd, error, triggerAmountPerChunk, triggerAmountPerChunkUI, triggerAmountPerChunkUsd]);
};

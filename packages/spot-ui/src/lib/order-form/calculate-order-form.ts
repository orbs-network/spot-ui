import BN from "bignumber.js";
import {
  calculateAmountValues,
  calculateMarketPriceValues,
  toAmountRaw,
} from "./amounts";
import { calculateOrderPrices } from "./prices";
import { getMaxPossibleTrades, getTrades } from "./schedule";
import {
  calculateDurationError,
  calculateFillDelayError,
  calculateTradesError,
  validateOrderForm,
} from "./validation";
import { calculateOrderValues } from "./values";
import type {
  CalculateOrderFormParams,
  CalculatedOrderForm,
  CalculatedOrderFormSchedule,
  CalculatedOrderInputAmount,
  CalculatedOrderTradePlan,
  CalculatedOrderTrades,
  CalculatedOrderValues,
} from "./types";

const calculateOrderInputAmount = (
  params: CalculateOrderFormParams,
): CalculatedOrderInputAmount => {
  const inputAmountRaw = toAmountRaw(
    params.userInput.inputAmountUi,
    params.inputTokenDecimals,
  );
  const amountValues = calculateAmountValues(
    inputAmountRaw,
    params.inputTokenDecimals,
    params.inputTokenUsdPrice,
  );

  return {
    ...amountValues,
    isEmpty: !BN(amountValues.raw || 0).gt(0),
  };
};

const calculateOrderTradePlan = (
  params: CalculateOrderFormParams,
  inputAmount: CalculatedOrderInputAmount,
  marketPrice: string,
): CalculatedOrderTradePlan => {
  const maxTrades = getMaxPossibleTrades(
    inputAmount.ui,
    params.inputTokenUsdPrice,
    params.minTradeSizeUsd,
  );
  const totalTrades = getTrades(
    maxTrades,
    params.module,
    params.userInput.tradeCount,
  );

  return {
    totalTrades,
    maxTrades,
    error: calculateTradesError(
      params,
      marketPrice,
      inputAmount,
      totalTrades,
      maxTrades,
    ),
  };
};

const calculateOrderFormTrades = (
  params: CalculateOrderFormParams,
  tradePlan: CalculatedOrderTradePlan,
  values: CalculatedOrderValues,
): CalculatedOrderTrades => ({
  totalTrades: tradePlan.totalTrades,
  maxTrades: tradePlan.maxTrades,
  inputAmountPerTrade: calculateAmountValues(
    values.inputAmountPerTrade,
    params.inputTokenDecimals,
    params.inputTokenUsdPrice,
  ),
  minOutputAmountPerTrade: calculateAmountValues(
    values.minOutputAmountPerTrade,
    params.outputTokenDecimals,
    params.outputTokenUsdPrice,
  ),
  triggerOutputAmountPerTrade: calculateAmountValues(
    values.triggerOutputAmountPerTrade,
    params.outputTokenDecimals,
    params.outputTokenUsdPrice,
  ),
  error: tradePlan.error,
});

const calculateOrderFormSchedule = (
  params: CalculateOrderFormParams,
  inputAmount: string,
  marketPrice: string,
  schedule: CalculatedOrderValues,
): CalculatedOrderFormSchedule => ({
  totalTrades: schedule.totalTrades,
  fillDelay: schedule.fillDelay,
  fillDelayMillis: schedule.fillDelayMillis,
  duration: schedule.duration,
  durationMillis: schedule.durationMillis,
  fillDelayError: calculateFillDelayError(
    inputAmount,
    marketPrice,
    schedule,
  ),
  durationError: calculateDurationError(
    params.module,
    inputAmount,
    marketPrice,
    schedule,
  ),
});

export const calculateOrderForm = (
  params: CalculateOrderFormParams,
): CalculatedOrderForm => {
  const inputAmountValues = calculateOrderInputAmount(params);
  const inputAmount = inputAmountValues.raw;
  const marketPriceValues = calculateMarketPriceValues({
    quotedOutputAmountRaw: params.quotedOutputAmountRaw,
    inputAmountUi: inputAmountValues.ui,
    outputTokenDecimals: params.outputTokenDecimals,
    outputUsdPrice: params.outputTokenUsdPrice,
  });
  const marketPrice = marketPriceValues.raw;
  const tradePlan = calculateOrderTradePlan(
    params,
    inputAmountValues,
    marketPrice,
  );
  const prices = calculateOrderPrices(params, inputAmount, marketPrice);
  const values = calculateOrderValues({
    module: params.module,
    inputTokenDecimals: params.inputTokenDecimals,
    totalInputAmount: inputAmount,
    fillDelay: params.userInput.tradeInterval,
    duration: params.userInput.orderDuration,
    totalTrades: tradePlan.totalTrades,
    priceProtectionPercent: params.priceProtectionPercent,
    isMarketOrder: prices.isMarketOrder,
    marketPrice,
    limitPrice: prices.limitPrice.raw,
    triggerPrice: prices.triggerPrice.raw,
    displayFeePercent: params.displayFeePercent,
  });
  const schedule = calculateOrderFormSchedule(
    params,
    inputAmount,
    marketPrice,
    values,
  );
  const trades = calculateOrderFormTrades(params, tradePlan, values);
  const validation = validateOrderForm(
    params,
    inputAmountValues,
    marketPrice,
    tradePlan,
    schedule,
    prices,
  );

  return {
    module: params.module,
    isInverted: Boolean(params.userInput.isPriceInverted),
    inputAmount: inputAmountValues,
    outputAmount: calculateAmountValues(
      values.outputAmount,
      params.outputTokenDecimals,
      params.outputTokenUsdPrice,
    ),
    marketPrice: marketPriceValues,
    trades,
    schedule,
    triggerPrice: prices.triggerPrice,
    limitPrice: prices.limitPrice,
    minOutputAmountTotal: calculateAmountValues(
      values.minOutputAmountTotal,
      params.outputTokenDecimals,
      params.outputTokenUsdPrice,
    ),
    tradePrice: calculateAmountValues(
      values.tradePrice,
      params.outputTokenDecimals,
      params.outputTokenUsdPrice,
    ),
    fees: {
      ...calculateAmountValues(
        values.displayFeeAmount,
        params.outputTokenDecimals,
        params.outputTokenUsdPrice,
      ),
      percentage: values.displayFeePercent,
    },
    values,
    ...validation,
  };
};

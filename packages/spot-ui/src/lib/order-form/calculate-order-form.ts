import BN from "bignumber.js";
import { Module } from "../types";
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

/**
 * Calculates display amounts, prices, trade schedules, and validation for an order form.
 * This is a local calculation: the host supplies the quote, token data, and user inputs.
 * Recalculate when those inputs change and check `canSubmit` before `client.prepareOrder`.
 *
 * @param params Form inputs in UI units, with quotes and balances in token base units.
 * @returns A form snapshot with `errors` for input validation. `isReady` means the
 * required amount, market quote, and input-token USD price are available (plus a
 * valid minimum output for SWAP); `canSubmit` also requires the form to pass validation.
 * Neither checks wallet state or allowance.
 */
export const calculateOrder = (
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
    quotedOutputAmountRaw: params.quotedOutputAmountRaw,
    minimumOutputAmountRaw: params.minimumOutputAmountRaw,
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
    isInverted: params.module === Module.SWAP ? false : Boolean(params.userInput.isPriceInverted),
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

/** @deprecated Use calculateOrder. Retained for existing DEX integrations. */
export const calculateOrderForm = calculateOrder;

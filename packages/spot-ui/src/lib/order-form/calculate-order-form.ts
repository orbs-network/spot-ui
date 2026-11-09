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
  CalculatedAmount,
  CalculatedOrderForm,
  CalculatedOrderFormSchedule,
  CalculatedOrderInputAmount,
  CalculatedOrderTradePlan,
  CalculatedOrderTrades,
  CalculatedOrderValues,
} from "./types";

const normalizeUsdAmount = (value?: string): string | undefined => {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return undefined;
  const amount = BN(value);
  return amount.isFinite() && amount.gte(0) ? value : undefined;
};

const withUsdAmount = (amount: CalculatedAmount, usd?: string): CalculatedAmount => ({
  ...amount,
  usd: amount.raw ? normalizeUsdAmount(usd) ?? amount.usd : amount.usd,
});

const calculateOrderInputAmount = (
  params: CalculateOrderFormParams,
): CalculatedOrderInputAmount => {
  const inputAmountRaw = toAmountRaw(
    params.userInput.inputAmountUi,
    params.inputTokenDecimals,
  );
  const amountValues = withUsdAmount(
    calculateAmountValues(
      inputAmountRaw,
      params.inputTokenDecimals,
      params.inputTokenUsdPrice,
    ),
    params.inputAmountUsd,
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
  // Use the complete USD total to avoid reconstructing it through rounded unit prices.
  const maxTrades = getMaxPossibleTrades(
    inputAmount.usd,
    "1",
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
): CalculatedOrderTrades => {
  const inputUsd = normalizeUsdAmount(params.inputAmountUsd);
  const inputAmountPerTradeUsd = inputUsd !== undefined && BN(values.inputAmount || 0).gt(0)
    ? values.totalTrades === 1
      ? inputUsd
      : BN(inputUsd).times(values.inputAmountPerTrade).div(values.inputAmount).toFixed()
    : undefined;

  return {
    totalTrades: tradePlan.totalTrades,
    maxTrades: tradePlan.maxTrades,
    inputAmountPerTrade: withUsdAmount(
      calculateAmountValues(
        values.inputAmountPerTrade,
        params.inputTokenDecimals,
        params.inputTokenUsdPrice,
      ),
      inputAmountPerTradeUsd,
    ),
    minOutputAmountPerTrade: withUsdAmount(
      calculateAmountValues(
        values.minOutputAmountPerTrade,
        params.outputTokenDecimals,
        params.outputTokenUsdPrice,
      ),
      params.module === Module.SWAP ? params.minimumOutputAmountUsd : undefined,
    ),
    triggerOutputAmountPerTrade: calculateAmountValues(
      values.triggerOutputAmountPerTrade,
      params.outputTokenDecimals,
      params.outputTokenUsdPrice,
    ),
    error: tradePlan.error,
  };
};

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
 * required amount, market quote, and input USD value are available (plus a
 * valid minimum output for SWAP); `canSubmit` also requires the form to pass validation.
 * The USD value can come from `inputAmountUsd` or the input token's unit price.
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
    outputAmount: withUsdAmount(
      calculateAmountValues(
        values.outputAmount,
        params.outputTokenDecimals,
        params.outputTokenUsdPrice,
      ),
      params.module === Module.SWAP ? params.quotedOutputAmountUsd : undefined,
    ),
    marketPrice: marketPriceValues,
    trades,
    schedule,
    triggerPrice: prices.triggerPrice,
    limitPrice: prices.limitPrice,
    minOutputAmountTotal: withUsdAmount(
      calculateAmountValues(
        values.minOutputAmountTotal,
        params.outputTokenDecimals,
        params.outputTokenUsdPrice,
      ),
      params.module === Module.SWAP ? params.minimumOutputAmountUsd : undefined,
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

import BN from "bignumber.js";
import { OrderType } from "../types";
import { SpotError } from "../errors";
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

const calculateOutputAmountValues = (
  params: CalculateOrderFormParams,
  amountRaw: string,
): CalculatedAmount => calculateAmountValues(amountRaw, params.outputTokenDecimals, params.outputTokenUsdPrice);

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
    params.orderType,
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

const calculateInputAmountPerTradeUsd = (
  params: CalculateOrderFormParams,
  values: CalculatedOrderValues,
): string | undefined => {
  const inputUsd = normalizeUsdAmount(params.inputAmountUsd);
  if (inputUsd === undefined || !BN(values.inputAmount || 0).gt(0)) return undefined;
  if (values.totalTrades === 1) return inputUsd;

  // Allocate the quoted USD total using raw amounts, preserving trade-size rounding.
  return BN(inputUsd).times(values.inputAmountPerTrade).div(values.inputAmount).toFixed();
};

const calculateOrderFormTrades = (
  params: CalculateOrderFormParams,
  tradePlan: CalculatedOrderTradePlan,
  values: CalculatedOrderValues,
): CalculatedOrderTrades => {
  return {
    totalTrades: tradePlan.totalTrades,
    maxTrades: tradePlan.maxTrades,
    inputAmountPerTrade: withUsdAmount(
      calculateAmountValues(
        values.inputAmountPerTrade,
        params.inputTokenDecimals,
        params.inputTokenUsdPrice,
      ),
      calculateInputAmountPerTradeUsd(params, values),
    ),
    minOutputAmountPerTrade: calculateOutputAmountValues(
      params,
      values.minOutputAmountPerTrade,
    ),
    triggerOutputAmountPerTrade: calculateOutputAmountValues(params, values.triggerOutputAmountPerTrade),
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
    params.orderType,
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
 * required amount, market quote, and input USD value are available;
 * `canSubmit` also requires the form to pass validation.
 * The USD value can come from `inputAmountUsd` or the input token's unit price.
 * `notReadyReason` identifies a missing prerequisite when `isReady` is false.
 * Once ready, use `errors` to explain validation failures that block `canSubmit`.
 * Neither checks wallet state or allowance.
 */
export const calculateOrder = (
  params: CalculateOrderFormParams,
): CalculatedOrderForm => {
  if (!Object.values(OrderType).includes(params?.orderType)) {
    throw new SpotError("INVALID_ARGUMENT", "orderType must be TWAP, LIMIT, STOP_LOSS, or TAKE_PROFIT; use prepareSwap for swaps");
  }
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
    orderType: params.orderType,
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
    orderType: params.orderType,
    isInverted: Boolean(params.userInput.isPriceInverted),
    inputAmount: inputAmountValues,
    outputAmount: calculateOutputAmountValues(params, values.outputAmount),
    marketPrice: marketPriceValues,
    trades,
    schedule,
    triggerPrice: prices.triggerPrice,
    limitPrice: prices.limitPrice,
    minOutputAmountTotal: calculateOutputAmountValues(
      params,
      values.minOutputAmountTotal,
    ),
    tradePrice: calculateOutputAmountValues(params, values.tradePrice),
    fees: {
      ...calculateOutputAmountValues(params, values.displayFeeAmount),
      percentage: values.displayFeePercent,
    },
    values,
    ...validation,
  };
};

/** @deprecated Use calculateOrder. Retained for existing DEX integrations. */
export const calculateOrderForm = calculateOrder;

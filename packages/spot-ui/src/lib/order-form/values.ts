import BN from "bignumber.js";
import { OrderType, OrderVariant } from "../types";
import { normalizeAmount } from "./amounts";
import { calculateOrderSchedule } from "./schedule";
import { getPriceProtectionBps } from "./price-protection";
import type {
  CalculateOrderValuesParams,
  CalculatedOrderValues,
} from "./types";

const getOutputAmount = (
  inputAmount?: string,
  price?: string,
  inputTokenDecimals?: number,
): string | undefined => {
  if (!inputAmount || !price || inputTokenDecimals == null) return undefined;

  return BN(inputAmount)
    .times(price)
    .div(BN(10).pow(inputTokenDecimals))
    .toFixed(0);
};

const getProtectedOutputAmount = (
  inputAmount: string,
  price: string,
  inputTokenDecimals: number,
): string => {
  const amount = BN(inputAmount).times(price).div(BN(10).pow(inputTokenDecimals));
  // Limits and triggers share floor rounding and a minimum of one base unit.
  // Display/output estimates above intentionally retain their usual rounding.
  return BN.max(1, amount).integerValue(BN.ROUND_FLOOR).toFixed(0);
};

const getMinOutputAmountPerTrade = (
  inputAmountPerTrade?: string,
  limitPrice?: string,
  isMarketOrder?: boolean,
  inputTokenDecimals?: number,
): string => {
  if (
    isMarketOrder ||
    inputTokenDecimals == null ||
    !inputAmountPerTrade ||
    !limitPrice
  ) {
    return "0";
  }

  return getProtectedOutputAmount(inputAmountPerTrade, limitPrice, inputTokenDecimals);
};

const getTriggerOutputAmountPerTrade = (
  orderType: OrderType,
  inputAmountPerTrade?: string,
  triggerPrice?: string,
  inputTokenDecimals?: number,
): string | undefined => {
  if (orderType === OrderType.TWAP || orderType === OrderType.LIMIT) return "0";
  if (inputTokenDecimals == null || !inputAmountPerTrade || !triggerPrice) {
    return undefined;
  }

  return getProtectedOutputAmount(inputAmountPerTrade, triggerPrice, inputTokenDecimals);
};

const getInputAmountPerTrade = (
  inputAmount = "",
  totalTrades = 0,
): string => {
  if (!inputAmount || !totalTrades) return "0";
  return BN(inputAmount)
    .div(totalTrades)
    .integerValue(BN.ROUND_FLOOR)
    .toFixed(0);
};

const getOrderVariant = (
  orderType: OrderType,
  isMarketOrder: boolean,
): OrderVariant => {
  if (orderType === OrderType.LIMIT) return OrderVariant.LIMIT;
  if (orderType === OrderType.STOP_LOSS) {
    return isMarketOrder
      ? OrderVariant.STOP_LOSS_MARKET
      : OrderVariant.STOP_LOSS_LIMIT;
  }
  if (orderType === OrderType.TAKE_PROFIT) {
    return isMarketOrder
      ? OrderVariant.TAKE_PROFIT_MARKET
      : OrderVariant.TAKE_PROFIT_LIMIT;
  }
  return isMarketOrder ? OrderVariant.TWAP_MARKET : OrderVariant.TWAP_LIMIT;
};

const getTradePrice = ({
  orderType,
  isMarketOrder,
  marketPrice,
  limitPrice,
  triggerPrice,
}: Pick<
  CalculateOrderValuesParams,
  | "orderType"
  | "isMarketOrder"
  | "marketPrice"
  | "limitPrice"
  | "triggerPrice"
>): string => {
  if (orderType === OrderType.LIMIT || !isMarketOrder) {
    return normalizeAmount(limitPrice);
  }
  if (orderType === OrderType.STOP_LOSS || orderType === OrderType.TAKE_PROFIT) {
    return normalizeAmount(triggerPrice);
  }
  return normalizeAmount(marketPrice);
};

const getTotalAmount = (amountPerTrade: string, totalTrades: number): string => {
  if (!amountPerTrade || !totalTrades) return "";
  return BN(amountPerTrade)
    .multipliedBy(totalTrades)
    .decimalPlaces(0)
    .toFixed();
};

const getDisplayFeeAmount = (outputAmount: string, percent: number): string => {
  if (!percent || !outputAmount) return "";
  return BN(outputAmount).multipliedBy(percent).dividedBy(100).toFixed(0);
};

export const calculateOrderValues = (
  params: CalculateOrderValuesParams,
): CalculatedOrderValues => {
  const schedule = calculateOrderSchedule(params);
  const slippageBps = getPriceProtectionBps(params.priceProtectionPercent);
  const displayFeePercent =
    typeof params.displayFeePercent === "number" &&
    Number.isFinite(params.displayFeePercent)
      ? params.displayFeePercent
      : 0;

  const inputAmount = normalizeAmount(params.totalInputAmount);
  const marketPrice = normalizeAmount(params.marketPrice);
  const limitPrice = normalizeAmount(params.limitPrice);
  const triggerPrice = normalizeAmount(params.triggerPrice);
  const tradePrice = getTradePrice({
    orderType: params.orderType,
    isMarketOrder: params.isMarketOrder,
    marketPrice,
    limitPrice,
    triggerPrice,
  });

  const inputAmountPerTrade = getInputAmountPerTrade(
    inputAmount,
    schedule.totalTrades,
  );
  const outputAmount = normalizeAmount(getOutputAmount(inputAmount, tradePrice, params.inputTokenDecimals));
  const minOutputAmountPerTrade = getMinOutputAmountPerTrade(
        inputAmountPerTrade,
        limitPrice,
        params.isMarketOrder,
        params.inputTokenDecimals,
      );
  const minOutputAmountTotal = getTotalAmount(
    minOutputAmountPerTrade,
    schedule.totalTrades,
  );
  const triggerOutputAmountPerTrade =
    getTriggerOutputAmountPerTrade(
      params.orderType,
      inputAmountPerTrade,
      triggerPrice,
      params.inputTokenDecimals,
    ) || "0";
  const displayFeeAmount = getDisplayFeeAmount(outputAmount, displayFeePercent);

  return {
    ...schedule,
    orderVariant: getOrderVariant(params.orderType, params.isMarketOrder),
    isMarketOrder: params.isMarketOrder,
    isTriggerPrice:
      params.orderType === OrderType.STOP_LOSS ||
      params.orderType === OrderType.TAKE_PROFIT,
    slippageBps,
    inputAmount,
    outputAmount,
    inputAmountPerTrade,
    minOutputAmountPerTrade,
    minOutputAmountTotal,
    triggerOutputAmountPerTrade,
    tradePrice,
    marketPrice,
    limitPrice,
    triggerPrice,
    displayFeeAmount,
    displayFeePercent,
  };
};

import BN from "bignumber.js";
import { Module, OrderType } from "../types";
import { normalizeAmount } from "./amounts";
import { calculateOrderSchedule } from "./schedule";
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

  const adjustedResult = BN(inputAmountPerTrade)
    .times(limitPrice)
    .div(BN(10).pow(inputTokenDecimals));
  return BN.max(1, adjustedResult).integerValue(BN.ROUND_FLOOR).toFixed(0);
};

const getTriggerOutputAmountPerTrade = (
  module: Module,
  inputAmountPerTrade?: string,
  triggerPrice?: string,
  inputTokenDecimals?: number,
): string | undefined => {
  if (module === Module.TWAP || module === Module.LIMIT) return "0";
  if (inputTokenDecimals == null || !inputAmountPerTrade || !triggerPrice) {
    return undefined;
  }

  const adjustedResult = BN(inputAmountPerTrade)
    .times(triggerPrice)
    .div(BN(10).pow(inputTokenDecimals));
  return BN.max(1, adjustedResult).integerValue(BN.ROUND_FLOOR).toFixed(0);
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

const getOrderType = (
  module: Module,
  isMarketOrder: boolean,
): OrderType => {
  if (module === Module.LIMIT) return OrderType.LIMIT;
  if (module === Module.STOP_LOSS) {
    return isMarketOrder
      ? OrderType.STOP_LOSS_MARKET
      : OrderType.STOP_LOSS_LIMIT;
  }
  if (module === Module.TAKE_PROFIT) {
    return isMarketOrder
      ? OrderType.TAKE_PROFIT_MARKET
      : OrderType.TAKE_PROFIT_LIMIT;
  }
  return isMarketOrder ? OrderType.TWAP_MARKET : OrderType.TWAP_LIMIT;
};

const getTradePrice = ({
  module,
  isMarketOrder,
  marketPrice,
  limitPrice,
  triggerPrice,
}: Pick<
  CalculateOrderValuesParams,
  | "module"
  | "isMarketOrder"
  | "marketPrice"
  | "limitPrice"
  | "triggerPrice"
>): string => {
  if (module === Module.LIMIT || !isMarketOrder) {
    return normalizeAmount(limitPrice);
  }
  if (module === Module.STOP_LOSS || module === Module.TAKE_PROFIT) {
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

export const calculateOrderValues = (
  params: CalculateOrderValuesParams,
): CalculatedOrderValues => {
  const schedule = calculateOrderSchedule(params);
  const slippageBps = Number.isFinite(params.priceProtectionPercent)
    ? params.priceProtectionPercent * 100
    : 0;
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
    module: params.module,
    isMarketOrder: params.isMarketOrder,
    marketPrice,
    limitPrice,
    triggerPrice,
  });

  const inputAmountPerTrade = getInputAmountPerTrade(
    inputAmount,
    schedule.totalTrades,
  );
  const outputAmount = normalizeAmount(
    getOutputAmount(inputAmount, tradePrice, params.inputTokenDecimals),
  );
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
      params.module,
      inputAmountPerTrade,
      triggerPrice,
      params.inputTokenDecimals,
    ) || "0";
  const displayFeeAmount =
    displayFeePercent && outputAmount
      ? BN(outputAmount)
          .multipliedBy(displayFeePercent)
          .dividedBy(100)
          .toFixed(0)
      : "";

  return {
    ...schedule,
    orderType: getOrderType(params.module, params.isMarketOrder),
    isMarketOrder: params.isMarketOrder,
    isTriggerPrice:
      params.module === Module.STOP_LOSS ||
      params.module === Module.TAKE_PROFIT,
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

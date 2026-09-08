import BN from "bignumber.js";
import {
  DEFAULT_STOP_LOSS_LIMIT_PERCENTAGE,
  DEFAULT_STOP_LOSS_PERCENTAGE,
  DEFAULT_TAKE_PROFIT_LIMIT_PERCENTAGE,
  DEFAULT_TAKE_PROFIT_PERCENTAGE,
} from "./constants";
import { InputErrors, Module, type InputError } from "../types";
import {
  calculateUsdAmount,
  normalizeAmount,
  toAmountRaw,
  toAmountUI,
} from "./amounts";
import type {
  CalculateLimitPriceValuesParams,
  CalculateOrderFormParams,
  CalculatePriceDisplayParams,
  CalculatePriceInputParams,
  CalculateTriggerPriceValuesParams,
  CalculatedLimitPriceValues,
  CalculatedOrderPrices,
  CalculatedPriceDisplay,
  CalculatedPriceInput,
  CalculatedTriggerPriceValues,
} from "./types";

export const calculatePriceInput = (
  params: CalculatePriceInputParams,
): CalculatedPriceInput => {
  const initialPrice = normalizeAmount(params.initialPrice);
  let resolvedPrice = "";

  if (params.typedValue !== undefined) {
    const typedPrice = BN(params.typedValue);
    const value = params.isInverted
      ? typedPrice.isZero()
        ? BN(0)
        : BN(1).dividedBy(typedPrice)
      : typedPrice;
    resolvedPrice = toAmountRaw(value.toFixed(), params.tokenDecimals);
  } else if (
    params.percentage !== undefined &&
    initialPrice &&
    BN(initialPrice).gt(0)
  ) {
    const percentFactor = BN(params.percentage || 0).dividedBy(100);
    resolvedPrice = BN(initialPrice)
      .plus(BN(initialPrice).multipliedBy(percentFactor))
      .decimalPlaces(0)
      .toFixed();
  } else if (initialPrice && BN(initialPrice).gt(0)) {
    resolvedPrice = BN(initialPrice).decimalPlaces(0).toFixed();
  }

  const raw = normalizeAmount(resolvedPrice);
  let percentage = "";
  if (initialPrice && !BN(initialPrice).isZero()) {
    if (params.percentage !== undefined && params.percentage !== null) {
      percentage = params.percentage;
    } else if (raw) {
      const difference = BN(raw)
        .minus(initialPrice)
        .dividedBy(initialPrice)
        .multipliedBy(100)
        .decimalPlaces(2)
        .toString();
      percentage = BN(difference).isZero() ? "" : difference;
    }
  }

  return {
    raw,
    typedValue: params.typedValue,
    percentage,
    isTypedValue: params.typedValue !== undefined,
  };
};

export const calculatePriceDisplay = (
  params: CalculatePriceDisplayParams,
): CalculatedPriceDisplay => {
  const sanitize = (value?: string): string => {
    if (!value) return "";
    const amount = BN(value);
    return amount.isFinite() && !amount.isNaN() ? value : "";
  };

  let ui = "";
  if (params.typedValue !== undefined) {
    ui = sanitize(params.typedValue);
  } else {
    const baseAmountUI = toAmountUI(params.raw, params.amountDecimals ?? 18);
    if (baseAmountUI && !BN(baseAmountUI).isZero()) {
      ui = params.isInverted
        ? BN(1).dividedBy(baseAmountUI).toFixed()
        : baseAmountUI;
    }
  }

  const raw = !ui
    ? ""
    : params.isInverted
      ? sanitize(toAmountRaw(ui, params.invertedAmountDecimals ?? 18))
      : sanitize(params.raw);
  const usdPrice = params.isInverted
    ? params.invertedAmountUsdPrice
    : params.amountUsdPrice;

  return {
    raw,
    ui,
    usd: calculateUsdAmount(ui, usdPrice),
  };
};

export const invertPriceInput = (value?: string): string | undefined => {
  if (value === undefined || value === "") return value;
  const amount = BN(value);
  if (!amount.isFinite() || amount.isNaN() || amount.isZero()) return "0";
  return BN(1).dividedBy(amount).toFixed();
};

const getDefaultTriggerPricePercentage = (
  module: Module,
): string | undefined => {
  if (module === Module.STOP_LOSS) return DEFAULT_STOP_LOSS_PERCENTAGE;
  if (module === Module.TAKE_PROFIT) return DEFAULT_TAKE_PROFIT_PERCENTAGE;
  return undefined;
};

const getDefaultLimitPricePercentage = (
  module: Module,
  isMarketOrder: boolean,
): string | undefined => {
  if (isMarketOrder) return undefined;
  if (module === Module.STOP_LOSS) {
    return DEFAULT_STOP_LOSS_LIMIT_PERCENTAGE;
  }
  if (module === Module.TAKE_PROFIT) {
    return DEFAULT_TAKE_PROFIT_LIMIT_PERCENTAGE;
  }
  return undefined;
};

const getTriggerPriceError = (
  module: Module,
  inputAmount: string | undefined,
  marketPrice: string,
  triggerPrice: string,
): InputError | undefined => {
  if (
    BN(inputAmount || "0").isZero() ||
    !marketPrice ||
    (module !== Module.STOP_LOSS && module !== Module.TAKE_PROFIT)
  ) {
    return undefined;
  }

  if (module === Module.STOP_LOSS && BN(triggerPrice || 0).gte(marketPrice)) {
    return {
      type: InputErrors.STOP_LOSS_TRIGGER_PRICE_GREATER_THAN_MARKET_PRICE,
      value: marketPrice,
    };
  }
  if (module === Module.TAKE_PROFIT && BN(triggerPrice || 0).lte(marketPrice)) {
    return {
      type: InputErrors.TAKE_PROFIT_TRIGGER_PRICE_LESS_THAN_MARKET_PRICE,
      value: marketPrice,
    };
  }
  if (!triggerPrice || BN(triggerPrice).isZero()) {
    return {
      type: InputErrors.EMPTY_TRIGGER_PRICE,
      value: triggerPrice,
    };
  }
  return undefined;
};

export const calculateTriggerPriceValues = (
  params: CalculateTriggerPriceValuesParams,
): CalculatedTriggerPriceValues => {
  const enabled =
    params.module === Module.STOP_LOSS ||
    params.module === Module.TAKE_PROFIT;
  const resolvedPercentage =
    params.triggerPricePercent === undefined
      ? getDefaultTriggerPricePercentage(params.module)
      : params.triggerPricePercent;
  const price = calculatePriceInput({
    tokenDecimals: params.outputTokenDecimals,
    initialPrice: enabled ? params.marketPrice : undefined,
    typedValue: params.triggerPrice,
    percentage: resolvedPercentage,
    isInverted: params.isInverted,
  });
  const display = calculatePriceDisplay({
    raw: price.raw,
    typedValue: price.typedValue,
    amountDecimals: params.outputTokenDecimals,
    invertedAmountDecimals: params.inputTokenDecimals,
    amountUsdPrice: params.outputUsdPrice,
    invertedAmountUsdPrice: params.inputUsdPrice,
    isInverted: params.isInverted,
  });
  return {
    ...price,
    enabled,
    display,
    error: getTriggerPriceError(
      params.module,
      params.inputAmountRaw,
      normalizeAmount(params.marketPrice),
      price.raw,
    ),
  };
};

const getLimitPriceError = (
  params: CalculateLimitPriceValuesParams,
  marketPrice: string,
  limitPrice: string,
): InputError | undefined => {
  if (
    BN(params.inputAmountRaw || "0").isZero() ||
    !marketPrice ||
    params.isMarketOrder
  ) {
    return undefined;
  }

  if (
    (params.module === Module.STOP_LOSS ||
      params.module === Module.TAKE_PROFIT) &&
    params.triggerPrice &&
    BN(limitPrice || 0).gte(params.triggerPrice)
  ) {
    return {
      type: InputErrors.TRIGGER_LIMIT_PRICE_GREATER_THAN_TRIGGER_PRICE,
      value: params.triggerPrice,
    };
  }
  if (!limitPrice || BN(limitPrice).isZero()) {
    return {
      type: InputErrors.MISSING_LIMIT_PRICE,
      value: limitPrice,
    };
  }
  return undefined;
};

export const calculateLimitPriceValues = (
  params: CalculateLimitPriceValuesParams,
): CalculatedLimitPriceValues => {
  const resolvedPercentage =
    params.limitPricePercent === undefined
      ? getDefaultLimitPricePercentage(params.module, params.isMarketOrder)
      : params.limitPricePercent;
  const price = calculatePriceInput({
    tokenDecimals: params.outputTokenDecimals,
    initialPrice: params.marketPrice,
    typedValue: params.limitPrice,
    percentage: resolvedPercentage,
    isInverted: params.isInverted,
  });
  const display = calculatePriceDisplay({
    raw: price.raw,
    typedValue: price.typedValue,
    amountDecimals: params.outputTokenDecimals,
    invertedAmountDecimals: params.inputTokenDecimals,
    amountUsdPrice: params.outputUsdPrice,
    invertedAmountUsdPrice: params.inputUsdPrice,
    isInverted: params.isInverted,
  });
  const marketPrice = normalizeAmount(params.marketPrice);

  return {
    ...price,
    display,
    error: getLimitPriceError(params, marketPrice, price.raw),
  };
};

export const calculateOrderPrices = (
  params: CalculateOrderFormParams,
  inputAmount: string,
  marketPrice: string,
): CalculatedOrderPrices => {
  const triggerPrice = calculateTriggerPriceValues({
    module: params.module,
    marketPrice,
    inputAmountRaw: inputAmount,
    triggerPrice: params.userInput.triggerPriceUi,
    triggerPricePercent: params.userInput.triggerPricePercent,
    isInverted: params.userInput.isPriceInverted,
    inputTokenDecimals: params.inputTokenDecimals,
    outputTokenDecimals: params.outputTokenDecimals,
    inputUsdPrice: params.inputTokenUsdPrice,
    outputUsdPrice: params.outputTokenUsdPrice,
  });
  const isMarketOrder =
    params.module === Module.LIMIT ? false : params.userInput.isMarketOrder;
  const limitPrice = calculateLimitPriceValues({
    module: params.module,
    isMarketOrder,
    marketPrice,
    inputAmountRaw: inputAmount,
    limitPrice: params.userInput.limitPriceUi,
    limitPricePercent: params.userInput.limitPricePercent,
    triggerPrice: triggerPrice.raw,
    isInverted: params.userInput.isPriceInverted,
    inputTokenDecimals: params.inputTokenDecimals,
    outputTokenDecimals: params.outputTokenDecimals,
    inputUsdPrice: params.inputTokenUsdPrice,
    outputUsdPrice: params.outputTokenUsdPrice,
  });

  return { isMarketOrder, triggerPrice, limitPrice };
};

import BN from "bignumber.js";
import {
  getDuration,
  getDestTokenAmount,
  getInputAmountPerTrade,
  getOutputMinAmountPerTrade,
  getTriggerOutputAmountPerTrade,
} from "./lib";
import {
  DEFAULT_FILL_DELAY,
  DEFAULT_STOP_LOSS_LIMIT_PERCENTAGE,
  DEFAULT_STOP_LOSS_PERCENTAGE,
  DEFAULT_TAKE_PROFIT_LIMIT_PERCENTAGE,
  DEFAULT_TAKE_PROFIT_PERCENTAGE,
} from "./consts";
import {
  InputErrors,
  Module,
  OrderType,
  type InputError,
  type TimeDuration,
} from "./types";

export interface CalculateOrderScheduleParams {
  module: Module;
  totalTrades: number;
  fillDelay?: TimeDuration;
  duration?: TimeDuration;
}

export interface CalculatedOrderSchedule {
  totalTrades: number;
  fillDelay: TimeDuration;
  fillDelayMillis: number;
  duration: TimeDuration;
  durationMillis: number;
}

export interface CalculatePriceInputParams {
  tokenDecimals: number;
  initialPrice?: string;
  typedValue?: string;
  percentage?: string | null;
  isInverted?: boolean;
}

export interface CalculatedPriceInput {
  raw: string;
  typedValue?: string;
  percentage: string;
  isTypedValue: boolean;
}

export interface CalculatePriceDisplayParams {
  raw?: string;
  typedValue?: string;
  amountDecimals?: number;
  invertedAmountDecimals?: number;
  amountUsdPrice?: string;
  invertedAmountUsdPrice?: string;
  isInverted?: boolean;
}

export interface CalculatedPriceDisplay {
  raw: string;
  ui: string;
  usd: string;
}

export interface CalculateTriggerPriceValuesParams {
  module: Module;
  marketPrice?: string;
  inputAmountWei?: string;
  triggerPrice?: string;
  triggerPricePercent?: string | null;
  isInverted?: boolean;
  inputTokenDecimals?: number;
  outputTokenDecimals: number;
  inputUsdPrice?: string;
  outputUsdPrice?: string;
}

export interface CalculatedTriggerPriceValues extends CalculatedPriceInput {
  enabled: boolean;
  display: CalculatedPriceDisplay;
  error?: InputError;
}

export interface CalculateLimitPriceValuesParams {
  module: Module;
  isMarketOrder: boolean;
  marketPrice?: string;
  inputAmountWei?: string;
  limitPrice?: string;
  limitPricePercent?: string | null;
  triggerPrice?: string;
  isInverted?: boolean;
  inputTokenDecimals?: number;
  outputTokenDecimals: number;
  inputUsdPrice?: string;
  outputUsdPrice?: string;
}

export interface CalculatedLimitPriceValues extends CalculatedPriceInput {
  display: CalculatedPriceDisplay;
  error?: InputError;
}

export interface CalculateOrderValuesParams {
  module: Module;
  inputTokenDecimals: number;
  totalInputAmount: string;
  fillDelay?: TimeDuration;
  duration?: TimeDuration;
  totalTrades: number;
  priceProtection: number;
  isMarketOrder: boolean;
  marketPrice?: string;
  limitPrice?: string;
  triggerPrice?: string;
  displayFeePercent?: number;
}

export interface CalculatedOrderValues extends CalculatedOrderSchedule {
  orderType: OrderType;
  isMarketOrder: boolean;
  isTriggerPrice: boolean;
  slippageBps: number;

  inputAmount: string;
  outputAmount: string;
  inputAmountPerTrade: string;
  minOutputAmountPerTrade: string;
  minOutputAmountTotal: string;
  triggerOutputAmountPerTrade: string;
  tradePrice: string;
  marketPrice: string;
  limitPrice: string;
  triggerPrice: string;
  displayFeeAmount: string;
  displayFeePercent: number;
}

const normalizeAmount = (value?: string): string => {
  if (!value) return "";
  const amount = BN(value);
  return amount.isFinite() && !amount.isNaN() ? value : "";
};

export const toAmountWei = (value?: string, decimals?: number): string => {
  if (decimals == null || !value) return "";
  const amount = BN(value);
  if (!amount.isFinite() || amount.isNaN()) return "";
  return amount.multipliedBy(BN(10).pow(decimals)).toFixed(0);
};

export const toAmountUI = (value?: string, decimals?: number): string => {
  if (decimals == null || !value) return "";
  const amount = BN(value);
  if (!amount.isFinite() || amount.isNaN()) return "";
  return amount.dividedBy(BN(10).pow(decimals)).toFixed();
};

export const calculateUsdAmount = (
  amountUI?: string,
  usdPrice?: string | number,
): string => {
  if (!amountUI || !usdPrice) return "";
  const amount = BN(amountUI);
  const price = BN(usdPrice);
  if (
    !amount.isFinite() ||
    amount.isNaN() ||
    amount.isZero() ||
    !price.isFinite() ||
    price.isNaN() ||
    price.isZero()
  ) {
    return "";
  }
  return amount.multipliedBy(price).toFixed();
};

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
    resolvedPrice = toAmountWei(value.toFixed(), params.tokenDecimals);
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
    const baseAmountUI = toAmountUI(
      params.raw,
      params.amountDecimals ?? 18,
    );
    if (baseAmountUI && !BN(baseAmountUI).isZero()) {
      ui = params.isInverted
        ? BN(1).dividedBy(baseAmountUI).toFixed()
        : baseAmountUI;
    }
  }

  const raw = !ui
    ? ""
    : params.isInverted
      ? sanitize(
          toAmountWei(ui, params.invertedAmountDecimals ?? 18),
        )
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

export const getDefaultTriggerPricePercentage = (
  module: Module,
): string | undefined => {
  if (module === Module.STOP_LOSS) return DEFAULT_STOP_LOSS_PERCENTAGE;
  if (module === Module.TAKE_PROFIT) return DEFAULT_TAKE_PROFIT_PERCENTAGE;
  return undefined;
};

export const getDefaultLimitPricePercentage = (
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
    params.module === Module.STOP_LOSS || params.module === Module.TAKE_PROFIT;
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
      params.inputAmountWei,
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
    BN(params.inputAmountWei || "0").isZero() ||
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

export const getOrderType = (
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

export const getTradePrice = ({
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

const normalizeTotalTrades = (module: Module, requestedTrades: number): number => {
  const finiteTrades = Number.isFinite(requestedTrades)
    ? Math.floor(requestedTrades)
    : 1;
  return module === Module.TWAP ? Math.max(1, finiteTrades) : 1;
};

const getDurationMillis = (duration: TimeDuration): number => {
  const milliseconds = duration.unit * duration.value;
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
};

export const calculateOrderSchedule = (
  params: CalculateOrderScheduleParams,
): CalculatedOrderSchedule => {
  const totalTrades = normalizeTotalTrades(params.module, params.totalTrades);
  const fillDelay = params.fillDelay ?? { ...DEFAULT_FILL_DELAY };
  const duration = getDuration(
    params.module,
    totalTrades,
    fillDelay,
    params.duration,
  );

  return {
    totalTrades,
    fillDelay,
    fillDelayMillis: getDurationMillis(fillDelay),
    duration,
    durationMillis: getDurationMillis(duration),
  };
};

export const calculateOrderValues = (
  params: CalculateOrderValuesParams,
): CalculatedOrderValues => {
  const schedule = calculateOrderSchedule(params);
  const slippageBps = Number.isFinite(params.priceProtection)
    ? params.priceProtection * 100
    : 0;
  let displayFeePercent = 0;
  if (
    typeof params.displayFeePercent === "number" &&
    Number.isFinite(params.displayFeePercent)
  ) {
    displayFeePercent = params.displayFeePercent;
  }

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
    getDestTokenAmount(inputAmount, tradePrice, params.inputTokenDecimals),
  );
  const minOutputAmountPerTrade = getOutputMinAmountPerTrade(
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

  const orderType = getOrderType(params.module, params.isMarketOrder);
  const isTriggerPrice =
    params.module === Module.STOP_LOSS ||
    params.module === Module.TAKE_PROFIT;

  return {
    ...schedule,
    orderType,
    isMarketOrder: params.isMarketOrder,
    isTriggerPrice,
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

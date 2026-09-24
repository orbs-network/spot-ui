export enum InputErrors {
  MAX_TRADES = "maxTradesError",
  MIN_TRADES = "minTradesError",
  MIN_TRADE_SIZE = "minTradeSizeError",
  MAX_FILL_DELAY = "maxFillDelayError",
  MIN_FILL_DELAY = "minFillDelayError",
  MAX_ORDER_DURATION = "maxDurationError",
  MIN_ORDER_DURATION = "minDurationError",
  MISSING_LIMIT_PRICE = "missingLimitPrice",
  STOP_LOSS_TRIGGER_PRICE_GREATER_THAN_MARKET_PRICE = "StopLossTriggerPriceError",
  TRIGGER_LIMIT_PRICE_GREATER_THAN_TRIGGER_PRICE = "triggerLimitPriceError",
  TAKE_PROFIT_TRIGGER_PRICE_LESS_THAN_MARKET_PRICE = "TakeProfitTriggerPriceError",
  EMPTY_TRIGGER_PRICE = "emptyTriggerPrice",
  INSUFFICIENT_BALANCE = "insufficientFunds",
  MAX_ORDER_SIZE = "maxOrderSize",
}

export type InputError = {
  type: InputErrors;
  value: string | number;
  args?: Record<string, string>;
};

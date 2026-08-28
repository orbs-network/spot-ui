import BN from "bignumber.js";
import {
  InputErrors,
  Module,
  getStopLossLimitPriceError,
  getStopLossPriceError,
  getTakeProfitLimitPriceError,
  getTakeProfitPriceError,
  type InputError,
} from "@orbs-network/spot-ui";

export interface TriggerPriceValidationInput {
  marketPrice?: string;
  triggerPrice?: string;
  module: Module;
}

export interface LimitPriceValidationInput {
  marketPrice?: string;
  triggerPrice?: string;
  limitPrice?: string;
  isMarketOrder: boolean;
  module: Module;
}

function isPositivePrice(value?: string): boolean {
  const price = BN(value || 0);
  return !price.isNaN() && price.gt(0);
}

export function validateTriggerPrice({
  marketPrice,
  triggerPrice,
  module,
}: TriggerPriceValidationInput): InputError | undefined {
  if (module !== Module.STOP_LOSS && module !== Module.TAKE_PROFIT) {
    return undefined;
  }
  if (!isPositivePrice(triggerPrice)) {
    return {
      type: InputErrors.EMPTY_TRIGGER_PRICE,
      value: triggerPrice || "",
    };
  }
  if (!isPositivePrice(marketPrice)) return undefined;

  const stopLossError = getStopLossPriceError(
    marketPrice,
    triggerPrice,
    module,
  );
  if (stopLossError?.isError) {
    return {
      type: InputErrors.STOP_LOSS_TRIGGER_PRICE_GREATER_THAN_MARKET_PRICE,
      value: stopLossError.value,
    };
  }

  const takeProfitError = getTakeProfitPriceError(
    marketPrice,
    triggerPrice,
    module,
  );
  if (takeProfitError?.isError) {
    return {
      type: InputErrors.TAKE_PROFIT_TRIGGER_PRICE_LESS_THAN_MARKET_PRICE,
      value: takeProfitError.value,
    };
  }

  return undefined;
}

export function validateLimitPrice({
  triggerPrice,
  limitPrice,
  isMarketOrder,
  module,
}: LimitPriceValidationInput): InputError | undefined {
  if (isMarketOrder) return undefined;

  if (!isPositivePrice(limitPrice)) {
    return {
      type: InputErrors.MISSING_LIMIT_PRICE,
      value: limitPrice || "",
    };
  }

  if (!isPositivePrice(triggerPrice)) return undefined;

  const stopLossError = getStopLossLimitPriceError(
    triggerPrice,
    limitPrice,
    isMarketOrder,
    module,
  );
  const takeProfitError = getTakeProfitLimitPriceError(
    triggerPrice,
    limitPrice,
    isMarketOrder,
    module,
  );

  if (stopLossError?.isError || takeProfitError?.isError) {
    return {
      type: InputErrors.TRIGGER_LIMIT_PRICE_GREATER_THAN_TRIGGER_PRICE,
      value: (stopLossError ?? takeProfitError)?.value ?? triggerPrice ?? "",
    };
  }

  return undefined;
}

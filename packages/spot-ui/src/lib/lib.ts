import BN from "bignumber.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as Spot from "@orbs-network/spot";
import Configs from "@orbs-network/twap/configs.json";
import {
  DEFAULT_FILL_DELAY,
  MAX_ORDER_DURATION_MILLIS,
  MIN_FILL_DELAY_MILLIS,
  MIN_ORDER_DURATION_MILLIS,
} from "./consts";
import {
  Config,
  Module,
  PartnerPayloadItem,
  Partners,
  TimeDuration,
  TimeUnit,
} from "./types";
import { findTimeUnit, getTimeDurationMillis } from "./utils";

const RING_ALLOWED_CHAIN_IDS = new Set([1, 56, 42161, 8453]);

const isPartnerChainAllowed = (partner: Partners, chainId: number) => {
  if (partner === Partners.Ring) {
    return RING_ALLOWED_CHAIN_IDS.has(chainId);
  }

  return true;
};

// values calculations

export const getDestTokenAmount = (
  srcAmount?: string,
  limitPrice?: string,
  srcTokenDecimals?: number,
) => {
  if (!srcAmount || !limitPrice || srcTokenDecimals == null) return undefined;

  const result = BN(srcAmount).times(limitPrice);
  const decimalAdjustment = BN(10).pow(srcTokenDecimals);
  return result.div(decimalAdjustment).toFixed(0);
};

export const getOutputMinAmountPerTrade = (
  inputAmountPerTrade?: string,
  limitPrice?: string,
  isMarketOrder?: boolean,
  srcTokenDecimals?: number,
) => {
  if (
    isMarketOrder ||
    srcTokenDecimals == null ||
    !inputAmountPerTrade ||
    !limitPrice
  )
    return BN(0).toString();
  const result = BN(inputAmountPerTrade).times(BN(limitPrice));
  const decimalAdjustment = BN(10).pow(srcTokenDecimals);
  const adjustedResult = result.div(decimalAdjustment);
  return BN.max(1, adjustedResult).integerValue(BN.ROUND_FLOOR).toFixed(0);
};

export const getTriggerOutputAmountPerTrade = (
  module: Module,
  inputAmountPerTrade?: string,
  triggerPrice?: string,
  srcTokenDecimals?: number,
) => {
  if (module === Module.TWAP || module === Module.LIMIT) {
    return "0";
  }

  if (srcTokenDecimals == null || !inputAmountPerTrade || !triggerPrice) return;
  const result = BN(inputAmountPerTrade).times(BN(triggerPrice));
  const decimalAdjustment = BN(10).pow(srcTokenDecimals);
  const adjustedResult = result.div(decimalAdjustment);
  return (
    BN.max(1, adjustedResult).integerValue(BN.ROUND_FLOOR).toFixed(0) || "0"
  );
};

export const getDuration = (
  module: Module,
  totalTrades: number,
  fillDelay: TimeDuration,
  customDuration?: TimeDuration,
): TimeDuration => {
  const minDuration = getTimeDurationMillis(fillDelay) * 2 * totalTrades;

  if (customDuration) {
    return customDuration;
  }

  if (module === Module.LIMIT) {
    return { unit: TimeUnit.Days, value: 7 } as TimeDuration;
  }

  if (module === Module.STOP_LOSS || module === Module.TAKE_PROFIT) {
    return { unit: TimeUnit.Days, value: 1 } as TimeDuration;
  }

  const unit = findTimeUnit(minDuration);
  return { unit, value: Number(BN(minDuration / unit).toFixed(2)) };
};

export const getTrades = (
  maxPossibleTrades: number,
  module: Module,
  selectedTrades?: number,
) => {
  if (module !== Module.TWAP) return 1;
  if (selectedTrades !== undefined) return selectedTrades;
  return Math.max(1, Math.ceil(maxPossibleTrades / 2));
};
export const getMaxPossibleTrades = (
  inputAmount?: string,
  inputUsdPrice?: string,
  minTradeSizeUsd?: number,
) => {
  if (!inputAmount || !inputUsdPrice || !minTradeSizeUsd) return 1;

  const totalUsd = BN(inputUsdPrice).times(inputAmount);

  const maxTradesBySize = totalUsd
    .div(minTradeSizeUsd)
    .integerValue(BN.ROUND_FLOOR)
    .toNumber();

  return Math.max(1, maxTradesBySize);
};

export const getDeadline = (
  currentTimeMillis: number,
  duration: TimeDuration,
) => {
  const minute = 60_000;
  return currentTimeMillis + getTimeDurationMillis(duration) + minute;
};

export const getEstimatedDelayBetweenTradesMillis = (config: Config) => {
  return config.bidDelaySeconds * 1000 * 2;
};

export const getInputAmountPerTrade = (inputAmount = "", totalTrades = 0) => {
  if (!inputAmount || !totalTrades) return "0";
  return BN(inputAmount)
    .div(totalTrades)
    .integerValue(BN.ROUND_FLOOR)
    .toFixed(0);
};

// errors
export const getMaxFillDelayError = (
  fillDelay: TimeDuration,
  totalTrades: number,
) => {
  const isDefault =
    fillDelay.unit === DEFAULT_FILL_DELAY.unit &&
    fillDelay.value === DEFAULT_FILL_DELAY.value;
  return {
    isError:
      !isDefault &&
      getTimeDurationMillis(fillDelay) * totalTrades >
      MAX_ORDER_DURATION_MILLIS,
    value: Math.floor(MAX_ORDER_DURATION_MILLIS / totalTrades),
  };
};

export const getStopLossPriceError = (
  marketPrice = "",
  triggerPrice = "",
  module: Module,
) => {
  if (module === Module.STOP_LOSS) {
    return {
      isError: BN(triggerPrice || 0).gte(BN(marketPrice || 0)),
      value: marketPrice,
    };
  }
};

export const getTakeProfitPriceError = (
  marketPrice = "",
  triggerPrice = "",
  module: Module,
) => {
  if (module === Module.TAKE_PROFIT) {
    return {
      isError: BN(triggerPrice || 0).lte(BN(marketPrice || 0)),
      value: marketPrice,
    };
  }
};

export const getStopLossLimitPriceError = (
  triggerPrice = "",
  limitPrice = "",
  isMarketOrder = false,
  module: Module,
) => {
  if (!isMarketOrder && module === Module.STOP_LOSS) {
    return {
      isError: BN(limitPrice || 0).gte(BN(triggerPrice || 0)),
      value: triggerPrice,
    };
  }
};

export const getTakeProfitLimitPriceError = (
  triggerPrice = "",
  limitPrice = "",
  isMarketOrder = false,
  module: Module,
) => {
  if (!isMarketOrder && module === Module.TAKE_PROFIT) {
    return {
      isError: BN(limitPrice || 0).gte(BN(triggerPrice || 0)),
      value: triggerPrice,
    };
  }
};

export const getMaxOrderDurationError = (
  module: Module,
  duration: TimeDuration,
) => {
  if (module === Module.STOP_LOSS || module === Module.TAKE_PROFIT) {
    const max = 60 * 24 * 60 * 60 * 1000; // 60 days
    return {
      isError: getTimeDurationMillis(duration) > max,
      value: max,
    };
  }
  return {
    isError: getTimeDurationMillis(duration) > MAX_ORDER_DURATION_MILLIS, // 365 days
    value: MAX_ORDER_DURATION_MILLIS,
  };
};

export const getMinOrderDurationError = (duration: TimeDuration) => {
  return {
    isError: getTimeDurationMillis(duration) < MIN_ORDER_DURATION_MILLIS,
    value: MIN_ORDER_DURATION_MILLIS,
  };
};

export const getMinFillDelayError = (fillDelay: TimeDuration) => {
  return {
    isError: getTimeDurationMillis(fillDelay) < MIN_FILL_DELAY_MILLIS,
    value: MIN_FILL_DELAY_MILLIS,
  };
};
export const getMinTradeSizeError = (
  inputAmount: string,
  inputUsdPrice: string,
  minTradeSizeUsd: number,
) => {
  return {
    isError: BN(inputUsdPrice || 0)
      .multipliedBy(inputAmount || 0)
      .isLessThan(minTradeSizeUsd),
    value: minTradeSizeUsd,
  };
};
export const getMaxTradesError = (
  totalTrades: number,
  maxTrades: number,
  module: Module,
) => {
  return {
    isError:
      module === Module.TWAP && BN(totalTrades).isGreaterThan(maxTrades),
    value: maxTrades,
  };
};

export const getTwapConfig = (partner: Partners, chainId: number) => {
  if (partner === Partners.Pancake) {
    switch (chainId) {
      case 56:
        return Configs.PancakeSwap;
      case 42161:
        return Configs.PancakeSwapArbitrum;
      case 8453:
        return Configs.PancakeSwapBase;
      case 59144:
        return Configs.PancakeSwapLinea;
      default:
        return Configs.PancakeSwap;
    }
  }
  if (partner === Partners.Sushiswap) {
    switch (chainId) {
      case 1:
        return Configs.SushiEth;
      case 42161:
        return Configs.SushiArb;
      case 8453:
        return Configs.SushiBase;
      case 747474:
        return Configs.SushiKatana;
      default:
        return Configs.SushiEth;
    }
  }
  if (partner === Partners.Quick) {
    switch (chainId) {
      case 137:
        return Configs.QuickSwap;
      case 8453:
        return Configs.QuickSwapBase;
      default:
        return Configs.QuickSwap;
    }
  }
  if (partner === Partners.Thena) {
    switch (chainId) {
      case 56:
        return Configs.Thena;
      default:
        return Configs.Thena;
    }
  }

  if (partner === Partners.Spooky) {
    switch (chainId) {
      case 250:
        return Configs.SpookySwap;
      case 146:
        return Configs.SpookySwapSonic;
      default:
        return Configs.SpookySwap;
    }
  }
  if (partner === Partners.Lynex) {
    switch (chainId) {
      case 59144:
        return Configs.Lynex;
      default:
        return Configs.Lynex;
    }
  }
  if (partner === Partners.Swapx) {
    switch (chainId) {
      case 146:
        return Configs.SwapX;
      default:
        return Configs.SwapX;
    }
  }
  if (partner === Partners.Blackhole) {
    switch (chainId) {
      case 43114:
        return Configs.BlackholeAvax;
      default:
        return Configs.BlackholeAvax;
    }
  }
  if (partner === Partners.Spark) {
    return Configs.SparkDEX;
  }
  if (partner === Partners.Katana) {
    switch (chainId) {
      case 747474:
        return Configs.SushiKatana;
      default:
        return Configs.SushiKatana;
    }
  }
};

export const getPartners = (): PartnerPayloadItem[] => {
  const raw = Spot.raw as Record<string, any>;
  const globalDex = raw["*"]?.dex ?? {};

  return Object.entries(raw)
    .filter(([chainId]) => chainId !== "*")
    .flatMap(([chainId, chainCfg]) => {
      const numericChainId = Number(chainId);
      const dex = { ...globalDex, ...(chainCfg?.dex ?? {}) };
      if (!dex || typeof dex !== "object") return [];

      return Object.entries(dex).flatMap(([name]) => {
        const partner = name as Partners;

        if (!isPartnerChainAllowed(partner, numericChainId)) return [];

        return [
          {
            chainId: numericChainId,
            name: name,
          },
        ];
      });
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

import BN from "bignumber.js";
import { useMemo } from "react";
import {
  DEFAULT_STOP_LOSS_LIMIT_PERCENTAGE,
  DEFAULT_STOP_LOSS_PERCENTAGE,
  DEFAULT_TAKE_PROFIT_LIMIT_PERCENTAGE,
  DEFAULT_TAKE_PROFIT_PERCENTAGE,
  type InputError,
} from "@orbs-network/spot-ui";
import { Module } from "../types";
import type { Token } from "../types";
import type { useLimitPricePanel } from "./use-limit-price-panel";
import type { usePricePanel } from "./use-price-panel";
import type { useTriggerPricePanel } from "./use-trigger-price-panel";

export enum ChartPriceLineKind {
  LIMIT = "limit-price",
  STOP_LOSS = "stop-loss",
  TAKE_PROFIT = "take-profit",
}

export interface ChartPriceLine {
  id: ChartPriceLineKind;
  kind: ChartPriceLineKind;
  label: string;
  price: string;
  priceWei: string;
  percentage: string;
  hasPrice: boolean;
  isLoading: boolean;
  error?: InputError;
  fromToken?: Token;
  toToken?: Token;
  onPriceChange: (price: string) => void;
  onReset: () => void;
}

interface UseChartPricePanelProps {
  module: Module;
  limitPricePanel: ReturnType<typeof useLimitPricePanel>;
  triggerPricePanel: ReturnType<typeof useTriggerPricePanel>;
  pricePanel: ReturnType<typeof usePricePanel>;
}

function isPositivePrice(price: string) {
  const value = BN(price);
  return !value.isNaN() && value.gt(0);
}

function getInitialLimitPercentage(module: Module) {
  if (module === Module.STOP_LOSS) {
    return DEFAULT_STOP_LOSS_LIMIT_PERCENTAGE;
  }
  if (module === Module.TAKE_PROFIT) {
    return DEFAULT_TAKE_PROFIT_LIMIT_PERCENTAGE;
  }
  return "0";
}

function getInitialTriggerPercentage(module: Module) {
  return module === Module.STOP_LOSS
    ? DEFAULT_STOP_LOSS_PERCENTAGE
    : DEFAULT_TAKE_PROFIT_PERCENTAGE;
}

/**
 * Builds the chart-facing representation of the active Spot price controls.
 * Prices use the same orientation as `pricePanel.fromToken` →
 * `pricePanel.toToken`, so a chart can render and edit them without keeping a
 * second copy of order-form state.
 */
export function useChartPricePanel({
  module,
  limitPricePanel,
  triggerPricePanel,
  pricePanel,
}: UseChartPricePanelProps) {
  const {
    fromToken,
    toToken,
    isInverted,
    marketPrice,
    onInvert,
  } = pricePanel;
  const {
    isLimitPrice,
    isLoading: isLimitPriceLoading,
    isTypedValue: isTypedLimitPrice,
    onInputChange: onLimitPriceChange,
    onReset: onLimitPriceReset,
    percentage: limitPricePercentage,
    price: limitPriceWei,
    priceUI: limitPrice,
  } = limitPricePanel;
  const {
    isLoading: isTriggerPriceLoading,
    isTypedValue: isTypedTriggerPrice,
    onInputChange: onTriggerPriceChange,
    onReset: onTriggerPriceReset,
    percentage: triggerPricePercentage,
    price: triggerPriceWei,
    priceUI: triggerPrice,
  } = triggerPricePanel;

  const lines = useMemo<ChartPriceLine[]>(() => {
    const result: ChartPriceLine[] = [];

    if (isLimitPrice) {
      const hasPrice = isPositivePrice(limitPrice);
      result.push({
        id: ChartPriceLineKind.LIMIT,
        kind: ChartPriceLineKind.LIMIT,
        label: "Limit price",
        price: limitPrice,
        priceWei: limitPriceWei,
        percentage:
          limitPricePercentage ||
          (!hasPrice ? getInitialLimitPercentage(module) : ""),
        hasPrice,
        isLoading: Boolean(isLimitPriceLoading && !isTypedLimitPrice),
        error: limitPricePanel.error,
        fromToken,
        toToken,
        onPriceChange: onLimitPriceChange,
        onReset: onLimitPriceReset,
      });
    }

    const triggerKind =
      module === Module.STOP_LOSS
        ? ChartPriceLineKind.STOP_LOSS
        : module === Module.TAKE_PROFIT
          ? ChartPriceLineKind.TAKE_PROFIT
          : undefined;

    if (triggerKind) {
      const hasPrice = isPositivePrice(triggerPrice);
      result.push({
        id: triggerKind,
        kind: triggerKind,
        label:
          triggerKind === ChartPriceLineKind.STOP_LOSS
            ? "Stop loss"
            : "Take profit",
        price: triggerPrice,
        priceWei: triggerPriceWei,
        percentage:
          triggerPricePercentage ||
          (!hasPrice ? getInitialTriggerPercentage(module) : ""),
        hasPrice,
        isLoading: Boolean(isTriggerPriceLoading && !isTypedTriggerPrice),
        error: triggerPricePanel.error,
        fromToken,
        toToken,
        onPriceChange: onTriggerPriceChange,
        onReset: onTriggerPriceReset,
      });
    }

    return result;
  }, [
    fromToken,
    isLimitPrice,
    isLimitPriceLoading,
    isTypedLimitPrice,
    isTypedTriggerPrice,
    isTriggerPriceLoading,
    limitPrice,
    limitPricePanel.error,
    limitPricePercentage,
    limitPriceWei,
    module,
    onLimitPriceChange,
    onLimitPriceReset,
    onTriggerPriceChange,
    onTriggerPriceReset,
    toToken,
    triggerPrice,
    triggerPricePanel.error,
    triggerPricePercentage,
    triggerPriceWei,
  ]);

  return useMemo(
    () => ({
      lines,
      fromToken,
      toToken,
      isInverted,
      marketPrice,
      onInvert,
    }),
    [fromToken, isInverted, lines, marketPrice, onInvert, toToken],
  );
}

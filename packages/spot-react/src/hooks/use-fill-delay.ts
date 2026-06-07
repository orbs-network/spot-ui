import { DEFAULT_FILL_DELAY, getMaxFillDelayError, getMinFillDelayError, TimeDuration, TimeUnit } from "@orbs-network/spot-ui";
import { useMemo, useCallback } from "react";
import { useSpotStore } from "../store";
import BN from "bignumber.js";
import { InputErrors } from "..";
import { useSpotContext } from "../spot-context";
import { useTrades } from "./use-trades";
import { millisToDays, millisToMinutes } from "../utils";

const formatFillDelayErrorValue = (milliseconds: number) => {
  const days = millisToDays(milliseconds);
  if (days >= 1) return `${days.toFixed(days % 1 ? 1 : 0)} days`;

  const hours = millisToMinutes(milliseconds) / 60;
  if (hours >= 1) return `${hours.toFixed(hours % 1 ? 1 : 0)} hours`;

  const minutes = millisToMinutes(milliseconds);
  return `${minutes.toFixed(minutes % 1 ? 1 : 0)} minutes`;
};

const useFillDelayError = (fillDelay: TimeDuration) => {
  const { totalTrades } = useTrades();
  const { marketPrice, typedInputAmount } = useSpotContext();
  const minFillDelayError = useMemo(() => {
    const { isError, value } = getMinFillDelayError(fillDelay);
    if (!isError || BN(typedInputAmount || "0").isZero() || !marketPrice) return undefined;
    return {
      type: InputErrors.MIN_FILL_DELAY,
      value: value,
      args: { fillDelay: formatFillDelayErrorValue(value) },
    };
  }, [fillDelay, typedInputAmount, marketPrice]);


  const maxFillDelayError = useMemo(() => {
    const { isError, value } = getMaxFillDelayError(fillDelay, totalTrades);
    if (!isError || BN(typedInputAmount || "0").isZero() || !marketPrice) return undefined;
    return {
      type: InputErrors.MAX_FILL_DELAY,
      value: value,
      args: { fillDelay: formatFillDelayErrorValue(value) },
    };
  }, [fillDelay, typedInputAmount, marketPrice, totalTrades]);

  return minFillDelayError || maxFillDelayError;
};

export const useFillDelay = () => {
  const { callbacks } = useSpotContext();
  const typedFillDelay = useSpotStore((s) => s.state.typedFillDelay);
  const updateState = useSpotStore((s) => s.updateState);
  const fillDelay = useMemo(() => typedFillDelay || DEFAULT_FILL_DELAY, [typedFillDelay]);
  const error = useFillDelayError(fillDelay);

  return {
    fillDelay,
    onChange: useCallback((typedFillDelay: TimeDuration) => {
      updateState({ typedFillDelay });
      callbacks?.onFillDelayChange?.(typedFillDelay);
    }, [updateState, callbacks]),
    error,
    milliseconds: fillDelay.unit * fillDelay.value,
  };
};

export const useFillDelayPanel = () => {
  const { onChange, fillDelay, error } = useFillDelay();
  const onInputChange = useCallback((value: string) => onChange({ unit: fillDelay.unit, value: Number(value) }), [onChange, fillDelay]);
  const onUnitSelect = useCallback((unit: TimeUnit) => onChange({ unit, value: fillDelay.value }), [onChange, fillDelay]);

  return {
    onInputChange,
    onUnitSelect,
    onChange,
    milliseconds: fillDelay.unit * fillDelay.value,
    fillDelay,
    error,
  };
};

import { DEFAULT_FILL_DELAY, getMinFillDelayError, TimeDuration, TimeUnit } from "@orbs-network/spot-ui";
import { useMemo, useCallback } from "react";
import { useSpotStore } from "../store";
import BN from "bignumber.js";
import { InputError, InputErrors, millisToMinutes } from "..";
import { useTranslations } from "./use-translations";
import { useSpotContext } from "../spot-context";

const useFillDelayError = (fillDelay: TimeDuration) => {
  const t = useTranslations();
  const { marketPrice, typedInputAmount } = useSpotContext();
  const minFillDelayError = useMemo((): InputError | undefined => {
    const { isError, value } = getMinFillDelayError(fillDelay);
    if (!isError || BN(typedInputAmount || "0").isZero() || !marketPrice) return undefined;
    return {
      type: InputErrors.MIN_FILL_DELAY,
      value: value,
      message: t("minFillDelayError", { fillDelay: `${millisToMinutes(value)} ${t("minutes")}` }),
    };
  }, [fillDelay, t, typedInputAmount, marketPrice]);

  return minFillDelayError;
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
  const t = useTranslations();
  const onInputChange = useCallback((value: string) => onChange({ unit: fillDelay.unit, value: Number(value) }), [onChange, fillDelay]);
  const onUnitSelect = useCallback((unit: TimeUnit) => onChange({ unit, value: fillDelay.value }), [onChange, fillDelay]);

  return {
    onInputChange,
    onUnitSelect,
    onChange,
    milliseconds: fillDelay.unit * fillDelay.value,
    fillDelay,
    error,
    label: t("tradeIntervalTitle"),
    tooltip: t("tradeIntervalTootlip"),
  };
};

import { getDuration, getMaxOrderDurationError, getMinOrderDurationError, InputErrors, TimeDuration, TimeUnit } from "@orbs-network/spot-ui";
import { useMemo, useCallback } from "react";
import { useSpotContext } from "../spot-context";
import { useSpotStore } from "../store";
import { millisToDays, millisToMinutes } from "../utils";
import { useTrades } from "./use-trades";
import { useFillDelay } from "./use-fill-delay";

const useDurationError = (duration: TimeDuration) => {
  const { module, marketPrice } = useSpotContext();

  return useMemo(() => {
    const maxError = getMaxOrderDurationError(module, duration);
    const minError = getMinOrderDurationError(duration);
    if (!marketPrice) return undefined;

    if (maxError.isError) {
      return {
        type: InputErrors.MAX_ORDER_DURATION,
        value: maxError.value,
        message: "maxDurationError", args: { duration: `${Math.floor(millisToDays(maxError.value)).toFixed(0)} days` },
      };
    }
    if (minError.isError) {
      return {
        type: InputErrors.MIN_ORDER_DURATION,
        value: minError.value,
        message: "minDurationError", args: { duration: `${Math.floor(millisToMinutes(minError.value)).toFixed(0)} minutes` },
      };
    }
  }, [duration, module, marketPrice]);
};

export const useDuration = () => {
  const { module, callbacks } = useSpotContext();
  const typedDuration = useSpotStore((s) => s.state.typedDuration);
  const updateState = useSpotStore((s) => s.updateState);
  const totalTrades = useTrades().totalTrades;
  const fillDelay = useFillDelay().fillDelay;
  const duration = useMemo(() => getDuration(module, totalTrades, fillDelay, typedDuration), [totalTrades, fillDelay, typedDuration, module]);
  const error = useDurationError(duration);

  return {
    duration,
    setDuration: useCallback((typedDuration: TimeDuration) => {
      updateState({ typedDuration });
      callbacks?.onDurationChange?.(typedDuration);
    }, [updateState, callbacks]),
    error,
  };
};

export const useDurationPanel = () => {
  const { duration, setDuration, error } = useDuration();

  const onInputChange = useCallback(
    (value: string) => {
      setDuration({ unit: duration.unit, value: Number(value) });
    },
    [setDuration, duration],
  );

  const onUnitSelect = useCallback(
    (unit: TimeUnit) => {
      setDuration({ unit, value: duration.value });
    },
    [setDuration, duration],
  );

  return {
    duration,
    onChange: setDuration,
    milliseconds: duration.unit * duration.value,
    onInputChange,
    onUnitSelect,
    error,
  };
};

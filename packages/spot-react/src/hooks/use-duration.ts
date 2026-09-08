import { type TimeDuration, TimeUnit } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotRuntime } from "../context/spot-runtime-context";
import { useSpotStore } from "../context/spot-store-context";
import { observe } from "../execution-state";

export const useDuration = () => {
  const { callbacks } = useSpotRuntime();
  const updateState = useSpotStore((state) => state.updateState);
  const { schedule } = useOrderForm();
  const { duration } = schedule;
  const onChange = useCallback(
    (orderDuration: TimeDuration) => {
      updateState({ orderDuration });
      observe(() => callbacks?.onOrderDurationChange?.(orderDuration));
    },
    [callbacks, updateState],
  );

  const onInputChange = useCallback(
    (value: string) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return;
      onChange({ unit: duration.unit, value: numericValue });
    },
    [duration.unit, onChange],
  );

  const onUnitSelect = useCallback(
    (unit: TimeUnit) => {
      onChange({ unit, value: duration.value });
    },
    [duration.value, onChange],
  );

  return useMemo(
    () => ({
      duration,
      onChange,
      milliseconds: schedule.durationMillis,
      onInputChange,
      onUnitSelect,
      error: schedule.durationError,
    }),
    [duration, onChange, onInputChange, onUnitSelect, schedule],
  );
};

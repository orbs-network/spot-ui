import { observe, type TimeDuration, TimeUnit } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useSpotTrading } from "../../provider/trading-context";
import { useSpotStore } from "../../store/store-context";
import { useOrderForm } from "../form-context";

export const useDuration = () => {
  const { callbacks } = useSpotTrading();
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

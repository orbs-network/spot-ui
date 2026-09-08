import { type TimeDuration, TimeUnit } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotRuntime } from "../context/spot-runtime-context";
import { useSpotStore } from "../context/spot-store-context";
import { observe } from "../execution-state";

export const useFillDelay = () => {
  const { callbacks } = useSpotRuntime();
  const updateState = useSpotStore((state) => state.updateState);
  const { schedule } = useOrderForm();
  const { fillDelay } = schedule;
  const onChange = useCallback(
    (tradeInterval: TimeDuration) => {
      updateState({ tradeInterval });
      observe(() => callbacks?.onTradeIntervalChange?.(tradeInterval));
    },
    [callbacks, updateState],
  );
  const onInputChange = useCallback(
    (value: string) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return;
      onChange({ unit: fillDelay.unit, value: numericValue });
    },
    [fillDelay.unit, onChange],
  );
  const onUnitSelect = useCallback(
    (unit: TimeUnit) => onChange({ unit, value: fillDelay.value }),
    [fillDelay.value, onChange],
  );

  return useMemo(
    () => ({
      onInputChange,
      onUnitSelect,
      onChange,
      milliseconds: schedule.fillDelayMillis,
      fillDelay,
      error: schedule.fillDelayError,
    }),
    [fillDelay, onChange, onInputChange, onUnitSelect, schedule],
  );
};

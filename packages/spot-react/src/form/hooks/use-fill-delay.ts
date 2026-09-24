import { observe, type TimeDuration, TimeUnit } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useSpotTrading } from "../../provider/trading-context";
import { useSpotStore } from "../../store/store-context";
import { useOrderForm } from "../form-context";

export const useFillDelay = () => {
  const { callbacks } = useSpotTrading();
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

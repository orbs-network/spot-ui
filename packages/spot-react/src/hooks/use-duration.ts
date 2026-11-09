import type { TimeDuration } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotTrading } from "../context/spot-trading-context";
import { useSpotStore } from "../context/spot-store-context";
import { observe } from "../execution-state";
import { useTimeInput } from "./use-time-input";

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

  const { onInputChange, onUnitSelect } = useTimeInput(duration, onChange);

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

import type { TimeDuration } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useOrderForm } from "../context/order-form-context";
import { useSpotTrading } from "../context/spot-trading-context";
import { useSpotStore } from "../context/spot-store-context";
import { observe } from "../execution-state";
import { useTimeInput } from "./use-time-input";

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
  const { onInputChange, onUnitSelect } = useTimeInput(fillDelay, onChange);

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

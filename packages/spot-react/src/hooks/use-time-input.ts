import type { TimeDuration, TimeUnit } from "@orbs-network/spot-ui";
import { useCallback } from "react";

/** Shared editing behavior; schedule validation remains in the calculated form. */
export const useTimeInput = (
  duration: TimeDuration,
  onChange: (duration: TimeDuration) => void,
) => {
  const onInputChange = useCallback(
    (value: string) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return;
      onChange({ unit: duration.unit, value: numericValue });
    },
    [duration.unit, onChange],
  );
  const onUnitSelect = useCallback(
    (unit: TimeUnit) => onChange({ unit, value: duration.value }),
    [duration.value, onChange],
  );

  return { onInputChange, onUnitSelect };
};

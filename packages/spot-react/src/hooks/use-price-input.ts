import { useCallback } from "react";
import type { Callbacks, State } from "../types";
import { observe } from "../execution-state";

const PRICE_FIELDS = {
  limit: {
    value: "limitPriceUi",
    percent: "limitPricePercent",
    onValueChange: "onLimitPriceChange",
    onPercentChange: "onLimitPricePercentChange",
  },
  trigger: {
    value: "triggerPriceUi",
    percent: "triggerPricePercent",
    onValueChange: "onTriggerPriceChange",
    onPercentChange: "onTriggerPricePercentChange",
  },
} as const;

/** A typed price and a percentage are alternative sources for the same field. */
export const usePriceInput = (
  kind: keyof typeof PRICE_FIELDS,
  updateState: (value: Partial<State>) => void,
  callbacks?: Callbacks,
) => {
  const fields = PRICE_FIELDS[kind];
  const onInputChange = useCallback(
    (value?: string) => {
      // null prevents a typed value from falling back to the default percentage.
      updateState({ [fields.value]: value, [fields.percent]: null });
      observe(() => callbacks?.[fields.onValueChange]?.(value || ""));
      observe(() => callbacks?.[fields.onPercentChange]?.(""));
    },
    [callbacks, fields, updateState],
  );
  const onPercentageChange = useCallback(
    (percentage?: string) => {
      updateState({ [fields.value]: undefined, [fields.percent]: percentage });
      observe(() => callbacks?.[fields.onValueChange]?.(""));
      observe(() => callbacks?.[fields.onPercentChange]?.(percentage || ""));
    },
    [callbacks, fields, updateState],
  );
  const onReset = useCallback(() => {
    // undefined restores calculation defaults for both representations.
    updateState({ [fields.value]: undefined, [fields.percent]: undefined });
  }, [fields, updateState]);

  return { onInputChange, onPercentageChange, onReset };
};

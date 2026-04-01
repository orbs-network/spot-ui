import { TimeUnit } from "@orbs-network/spot-ui";
export const REFETCH_ORDER_HISTORY = 20_000;

export const DEFAULT_DURATIONS: { text: string; value: TimeUnit }[] = [
  {
    text: "Minutes",
    value: TimeUnit.Minutes,
  },
  {
    text: "Hours",
    value: TimeUnit.Hours,
  },
  {
    text: "Days",
    value: TimeUnit.Days,
  },
];
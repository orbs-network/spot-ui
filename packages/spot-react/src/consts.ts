import { TimeUnit } from "@orbs-network/spot-ui";
export const REFETCH_ORDER_HISTORY = 20_000;

export const DEFAULT_DURATION_OPTIONS: { text: string; value: TimeUnit }[] = [
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

export const PRICE_PROTECTION_SETTINGS =
  "The protocol uses an oracle price to help protect users from unfavorable executions. If the execution price is worse than the oracle price by more than the allowed percentage, the transaction will not be executed.";

import { toAmountUI } from "@orbs-network/spot-ui";
import { useMemo } from "react";

export const useAmountUi = (decimals?: number, value?: string) => {
  return useMemo(() => toAmountUI(value, decimals), [decimals, value]);
};

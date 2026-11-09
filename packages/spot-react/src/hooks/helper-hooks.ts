import { toAmountUI } from "@orbs-network/spot-ui/internal";
import { useMemo } from "react";

export const useAmountUi = (decimals?: number, value?: string) => {
  return useMemo(() => toAmountUI(value, decimals), [decimals, value]);
};

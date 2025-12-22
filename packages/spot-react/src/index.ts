import { useCallback } from "react";
import { setUIVersion } from "@orbs-network/spot-sdk";
import { useTwapStore } from "./useTwapStore";
import pkg from "../package.json";

// Set the UI version in spot-sdk for analytics
setUIVersion(pkg.version);

export * from "./twap/twap";
export * from "./types";
export * from "./utils";
export { Configs, PRICE_PROTECTION_SETTINGS } from "./consts";
export { useFormatNumber } from "./hooks/helper-hooks";
export const useTypedSrcAmount = () => {
  const updateState = useTwapStore((s) => s.updateState);

  return {
    amount: useTwapStore((s) => s.state.typedSrcAmount),
    reset: useCallback(() => updateState({ typedSrcAmount: "" }), [updateState]),
  };
};

import { useMemo } from "react";
import { useSpotContext } from "../spot-context";

export const useSupportedChains = () => {
  const { supportedChains } = useSpotContext();
  return useMemo(() => supportedChains, [supportedChains]);
};
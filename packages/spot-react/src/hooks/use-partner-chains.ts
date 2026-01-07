import { useMemo } from "react";
import { useSpotContext } from "../spot-context";

export const usePartnerChains = () => {
  const { supportedChains } = useSpotContext();
  return useMemo(() => supportedChains, [supportedChains]);
};
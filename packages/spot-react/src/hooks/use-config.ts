
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";

export const useConfig = () => {
  const { config, supportedChains } = useSpotContext();
  return useMemo(() => {
    if (!config) return;
    const { twapConfig, ...rest } = config;

    return {
      ...rest,
      supportedChains,
    };
  }, [config, supportedChains])
};

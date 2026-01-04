
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";

export const useConfig = () => {
  const { config, supportedChains, chainId } = useSpotContext();
  return useMemo(() => {
    if (!config) return;
    const { twapConfig, ...rest } = config;

    return {
      ...rest,
      supportedChains,
      invalidChain: chainId ? !supportedChains.includes(chainId) : false,
    };
  }, [config, supportedChains, chainId]);
};

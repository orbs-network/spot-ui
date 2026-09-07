import { getExplorerUrl, getNetwork, toAmountUI } from "@orbs-network/spot-ui";
import { useMemo } from "react";
import { useSpotRuntime } from "../context/spot-store";

export const useAmountUi = (decimals?: number, value?: string) => {
  return useMemo(() => toAmountUI(value, decimals), [decimals, value]);
};

export const useNetwork = (chainIdOverride?: number) => {
  const { chainId: currentChainId } = useSpotRuntime();
  const chainId = chainIdOverride ?? currentChainId;
  return useMemo(() => getNetwork(chainId), [chainId]);
};

export const useExplorerLink = (txHash?: string, chainId?: number) => {
  const network = useNetwork(chainId);
  return useMemo(() => {
    if (!txHash || !network) return undefined;
    return getExplorerUrl(txHash, network.id);
  }, [txHash, network]);
};

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  polygon,
  mainnet,
  arbitrum,
  bsc,
  linea,
  sei,
  base,
  sonic,
  berachain,
  flare,
  avalanche,
  monad,
  optimism,
  mantle,
} from "viem/chains";
import { http, type Chain } from "viem";
import { useIsSpotTab } from "./hooks/use-tabs";
import { useMemo } from "react";
import { katanaChain } from "./chains";

const rpcProxyTransport = (chain: Chain) =>
  http(`/api/rpc?chainId=${chain.id}`);

const MAIN_CHAINS = [
  mainnet,
  arbitrum,
  bsc,
  linea,
  base,
  sonic,
  polygon,
  monad,
] as const;

export const SWAP_SUPPORTED_CHAIN_IDS = MAIN_CHAINS.map((chain) => chain.id);

const SPOT_CHAINS = [
  bsc,
  linea,
  sei,
  base,
  sonic,
  polygon,
  berachain,
  flare,
  avalanche,
  monad,
  arbitrum,
  mainnet,
  katanaChain,
  optimism,
  mantle,
] as const;

const MAIN_CONFIG = getDefaultConfig({
  pollingInterval: 60_0000,
  appName: "Playground",
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID as string,
  chains: MAIN_CHAINS,
  transports: Object.fromEntries(
    MAIN_CHAINS.map((chain) => [chain.id, rpcProxyTransport(chain)]),
  ) as Record<(typeof MAIN_CHAINS)[number]["id"], ReturnType<typeof http>>,
});

const SPOT_CONFIG = getDefaultConfig({
  pollingInterval: 60_0000,
  appName: "Playground",
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID as string,
  chains: SPOT_CHAINS,
  transports: Object.fromEntries(
    SPOT_CHAINS.map((chain) => [chain.id, rpcProxyTransport(chain)]),
  ) as Record<(typeof SPOT_CHAINS)[number]["id"], ReturnType<typeof http>>,
});



export const useWagmiConfig = () => {
  const isSpot = useIsSpotTab()

  return useMemo(() => {
    return isSpot ? SPOT_CONFIG : MAIN_CONFIG
  }, [isSpot])
}

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
  unichain,
  xLayer,
} from "viem/chains";
import { http, type Chain } from "viem";
import { hyperEvmChain, katanaChain, megaethChain, robinhoodChain } from "./chains";

const rpcProxyTransport = (chain: Chain) =>
  http(`/api/rpc?chainId=${chain.id}`);

const CHAINS = [
  mainnet,
  arbitrum,
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
  katanaChain,
  optimism,
  mantle,
  hyperEvmChain,
  unichain,
  xLayer,
  megaethChain,
  robinhoodChain,
] as const;

// Keep one wallet store and connector set across all routes.
export const wagmiConfig = getDefaultConfig({
  ssr: true,
  pollingInterval: 60_0000,
  appName: "Playground",
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID as string,
  chains: CHAINS,
  transports: Object.fromEntries(
    CHAINS.map((chain) => [chain.id, rpcProxyTransport(chain)]),
  ) as Record<(typeof CHAINS)[number]["id"], ReturnType<typeof http>>,
});

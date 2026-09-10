import type { Chain } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import * as chains from "viem/chains";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
    },
  },
});

export const katanaChain: Chain = defineChain({
  id: 747474,
  name: "Katana",
  network: "katana",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [`https://rpc.katanarpc.com`],
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 7654707,
    },
  },
});

export const hyperEvmChain: Chain = defineChain({
  id: 999,
  name: "HyperEVM",
  network: "hyperevm",
  nativeCurrency: {
    decimals: 18,
    name: "HYPE",
    symbol: "HYPE",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.hyperliquid.xyz/evm"],
    },
  },
  blockExplorers: {
    default: {
      name: "HyperEVMScan",
      url: "https://hyperevmscan.io",
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 0,
    },
  },
});

export const megaethChain: Chain = defineChain({
  id: 4326,
  name: "MegaETH",
  network: "megaeth",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://mainnet.megaeth.com/rpc"],
      webSocket: ["wss://mainnet.megaeth.com/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "MegaETH Etherscan",
      url: "https://mega.etherscan.io",
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 0,
    },
  },
});

const customChains = [katanaChain, hyperEvmChain, megaethChain, robinhoodChain];

export const getChain = (chainId?: number): Chain | undefined =>
  customChains.find((chain) => chain.id === chainId) ??
  Object.values(chains).find((chain) => chain.id === chainId);

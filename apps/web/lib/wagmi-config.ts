import {
  getDefaultConfig,
  type RainbowKitWalletConnectParameters,
  type Wallet,
  type WalletList,
} from "@rainbow-me/rainbowkit";
import { walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
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
import { createStorage } from "wagmi";
import { useIsSpotTab } from "./hooks/use-tabs";
import { useMemo } from "react";
import { katanaChain } from "./chains";
import { usePathname } from "next/navigation";

const utilaStorage = createStorage({
  key: "utila-wagmi-agent-v2",
  storage: {
    getItem: (key) =>
      typeof window !== "undefined" ? window.localStorage.getItem(key) : null,
    removeItem: (key) => {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
    },
    setItem: (key, value) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, value);
      }
    },
  },
});

const MAIN_CHAINS = [
  arbitrum,
  mainnet,
  bsc,
  linea,
  base,
  sonic,
  polygon,
  monad,
] as const;

const UTILA_CHAINS = MAIN_CHAINS;

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

const UTILA_ICON_URL =
  "data:image/svg+xml,%3Csvg%20width%3D%22120%22%20height%3D%22120%22%20viewBox%3D%220%200%20120%20120%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Crect%20width%3D%22120%22%20height%3D%22120%22%20rx%3D%2224%22%20fill%3D%22%23111638%22/%3E%3Cpath%20d%3D%22M48%2076L41%2083C32%2092%2018%2092%209%2083C0%2074%200%2060%209%2051L16%2044%22%20stroke%3D%22white%22%20stroke-width%3D%2212%22%20stroke-linecap%3D%22round%22/%3E%3Cpath%20d%3D%22M72%2044L79%2037C88%2028%20102%2028%20111%2037C120%2046%20120%2060%20111%2069L104%2076%22%20stroke%3D%22white%22%20stroke-width%3D%2212%22%20stroke-linecap%3D%22round%22/%3E%3Cpath%20d%3D%22M45%2061H75%22%20stroke%3D%22white%22%20stroke-width%3D%2212%22%20stroke-linecap%3D%22round%22/%3E%3C/svg%3E";

const utilaWallet: WalletList[number]["wallets"][number] = (
  options,
): Wallet => {
  const walletConnect = walletConnectWallet(options);
  const getWalletConnectUri = (uri: string) => uri;

  return {
    ...walletConnect,
    id: "utila",
    name: "Utila",
    shortName: "Utila",
    iconUrl: UTILA_ICON_URL,
    iconBackground: "#111638",
    // Utila has no registered mobile native/universal WalletConnect link yet.
    // Returning a raw wc: URI lets mobile browsers route to another wallet app.
    qrCode: {
      getUri: getWalletConnectUri,
    },
  };
};

const UTILA_WALLET_CONNECT_PARAMETERS = {
  customStoragePrefix: "utila-wc-agent-v4",
} as unknown as RainbowKitWalletConnectParameters;

const MAIN_CONFIG = getDefaultConfig({
  pollingInterval: 60_0000,
  appName: "Playground",
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID as string,
  chains: MAIN_CHAINS,
});

const SPOT_CONFIG = getDefaultConfig({
  pollingInterval: 60_0000,
  appName: "Playground",
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID as string,
  chains: SPOT_CHAINS,
});

const UTILA_CONFIG = getDefaultConfig({
  pollingInterval: 60_0000,
  appName: "Utila",
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID as string,
  storage: utilaStorage,
  walletConnectParameters: UTILA_WALLET_CONNECT_PARAMETERS,
  wallets: [
    {
      groupName: "Utila",
      wallets: [utilaWallet],
    },
  ],
  chains: UTILA_CHAINS,
});

export const useWagmiConfig = () => {
  const pathname = usePathname();
  const isSpot = useIsSpotTab();
  const isUtila = pathname === "/" || pathname === "/history";

  return useMemo(() => {
    if (isUtila) {
      return UTILA_CONFIG;
    }

    return isSpot ? SPOT_CONFIG : MAIN_CONFIG;
  }, [isSpot, isUtila]);
};

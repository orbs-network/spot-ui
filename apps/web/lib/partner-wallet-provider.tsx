"use client";

import { useMemo, type ReactNode } from "react";
import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { useConfig, WagmiContext } from "wagmi";
import { useSpotPartners } from "./hooks/use-spot-partners";
import { useSwapParams } from "./hooks/use-swap-params";
import { useIsSpotTab } from "./hooks/use-tabs";
import { getPartnerChains } from "./spot-partners";
import { scopeWalletChains } from "./wallet-chain-config";

const theme = darkTheme();

export function PartnerWalletProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const { parsedPartner } = useSwapParams();
  const isSpot = useIsSpotTab();
  const { data: partners } = useSpotPartners();
  const scopedConfig = useMemo(
    () => isSpot
      ? scopeWalletChains(config, getPartnerChains(config.chains, partners ?? [], parsedPartner))
      : config,
    [config, isSpot, partners, parsedPartner],
  );

  // Only the chain list changes; hydration, connectors and connection state
  // remain owned by the single outer WagmiProvider.
  return (
    <WagmiContext.Provider value={scopedConfig}>
      <RainbowKitProvider theme={theme}>{children}</RainbowKitProvider>
    </WagmiContext.Provider>
  );
}

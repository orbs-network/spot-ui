import { createContext, useContext, type ReactNode } from "react";
import {
  Module,
  type Address,
  type Partners,
} from "@orbs-network/spot-ui";
import type {
  Callbacks,
  Overrides,
  Token,
  WalletInteractions,
} from "../types";

export interface SpotRuntimeState {
  walletInteractions: WalletInteractions;
  quotedOutputAmountRaw?: string;
  marketPriceLoading?: boolean;
  account?: Address;
  noLiquidity?: boolean;
  inputAmountUi: string;
  partner: Partners;
  minTradeSizeUsd: number;
  inputToken?: Token;
  outputToken?: Token;
  wrappedNativeToken: Token | undefined;
  inputTokenUsdPrice?: string;
  outputTokenUsdPrice?: string;
  inputBalanceRaw?: string;
  chainId?: number;
  isSupportedChain: boolean;
  priceProtectionPercent: number;
  displayFeePercent: number;
  module: Module;
  callbacks?: Callbacks;
  supportLegacyOrders: boolean;
  overrides?: Overrides;
}

const SpotRuntimeContext = createContext<SpotRuntimeState | null>(null);

export const SpotRuntimeProvider = ({
  children,
  value,
}: {
  children: ReactNode;
  value: SpotRuntimeState;
}) => (
  <SpotRuntimeContext.Provider value={value}>
    {children}
  </SpotRuntimeContext.Provider>
);

export const useSpotRuntime = (): SpotRuntimeState => {
  const runtime = useContext(SpotRuntimeContext);
  if (runtime === null) {
    throw new Error("useSpotRuntime must be used within SpotProvider");
  }
  return runtime;
};

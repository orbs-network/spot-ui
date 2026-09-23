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

/** Complete trading inputs, including connection and integration settings. */
export interface SpotTradingState {
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
  inputBalanceRaw: string | undefined;
  inputTokenUsdPrice: string | undefined;
  outputTokenUsdPrice?: string;
  chainId?: number;
  hasChainId: boolean;
  priceProtectionPercent: number;
  displayFeePercent: number;
  module: Module;
  callbacks?: Callbacks;
  supportLegacyOrders: boolean;
  overrides?: Overrides;
}

const SpotTradingContext = createContext<SpotTradingState | null>(null);

export const SpotTradingProvider = ({
  children,
  value,
}: {
  children: ReactNode;
  value: SpotTradingState;
}) => {
  return (
    <SpotTradingContext.Provider value={value}>
      {children}
    </SpotTradingContext.Provider>
  );
};

export const useSpotTrading = (): SpotTradingState => {
  const trading = useContext(SpotTradingContext);
  if (trading === null) {
    throw new Error("useSpotTrading must be used within SpotProvider");
  }
  return trading;
};

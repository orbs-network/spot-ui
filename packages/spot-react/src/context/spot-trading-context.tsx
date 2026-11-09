import { createContext, useContext, type ReactNode } from "react";
import {
  type Address,
  type Partners,
  type SwapQuote,
} from "@orbs-network/spot-ui";
import type {
  Callbacks,
  AdvancedOrderModule,
  Overrides,
  Token,
  WalletInteractions,
} from "../types";

/** Complete trading inputs, including connection and integration settings. */
export interface SpotTradingState {
  walletInteractions: WalletInteractions;
  quote?: SwapQuote;
  quotedOutputAmountRaw?: string;
  /** Quoted minimum in output-token base units. */
  minimumOutputAmountRaw?: string;
  inputAmountUsd?: string;
  quotedOutputAmountUsd?: string;
  minimumOutputAmountUsd?: string;
  marketPriceLoading?: boolean;
  account?: Address;
  noLiquidity?: boolean;
  inputAmountUi: string;
  partner: Partners;
  disableAnalytics: boolean;
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
  module: AdvancedOrderModule;
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
    throw new Error("useSpotTrading must be used within AdvancedOrdersProvider");
  }
  return trading;
};

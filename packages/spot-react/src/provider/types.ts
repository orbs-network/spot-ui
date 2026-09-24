import type { Address, Module, Partners, Token } from "@orbs-network/spot-ui";
import { type WalletInteractions } from "@orbs-network/spot-ui";
import type { ComponentType, ReactNode } from "react";
import { type MarketQuote, type Overrides } from "../form/types";
import { type Callbacks } from "./callbacks";

export interface ClientErrorFallbackProps {
  error: Error;
  retry: () => Promise<void>;
  isRetrying: boolean;
}

export interface SpotErrorFallbackProps {
  error: Error;
  resetErrorBoundary: (...args: unknown[]) => void;
}

export interface SpotProps {
  children?: ReactNode;
  walletInteractions: WalletInteractions;
  chainId?: number;
  account?: Address;
  partner: Partners;
  inputToken?: Token;
  outputToken?: Token;
  /** Host-owned chain metadata; may be undefined only before a chain is known. */
  wrappedNativeToken: Token | undefined;
  /** Raw input-token balance; undefined represents a disconnected/loading state. */
  inputBalanceRaw: string | undefined;
  /** USD value of one input token; undefined represents a loading state. */
  inputTokenUsdPrice: string | undefined;
  outputTokenUsdPrice?: string;
  priceProtectionPercent: number;
  module: Module;
  marketQuote: MarketQuote;
  overrides?: Overrides;
  /** Display-only estimate; protocol fee collection is configured separately. */
  displayFeePercent?: number;
  callbacks?: Callbacks;
  minTradeSizeUsd: number;
  inputAmountUi: string;
  supportLegacyOrders?: boolean;
  /** Host-rendered, retryable UI for client initialization failures. */
  clientErrorFallback?: ComponentType<ClientErrorFallbackProps>;
  /** Host-rendered fallback for unexpected calculation or rendering errors. */
  errorFallback?: ComponentType<SpotErrorFallbackProps>;
}

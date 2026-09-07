import {
  Partners,
  Module,
  Order,
  TimeDuration,
  type Address,
  type AllowanceRequest,
  type ApprovalRequest,
  type CalculatedOrderForm,
  type CancelOrderRequest,
  type OrderSigningRequest,
  type PreparedOrder,
  type Token,
} from "@orbs-network/spot-ui";
import type { ComponentType, ReactNode } from "react";
export enum ExecutionStatus {
  LOADING = 1,
  SUCCESS = 2,
  FAILED = 3,
}

export enum ExecutionPhase {
  IDLE = "idle",
  PREPARING = "preparing",
  WRAPPING = "wrapping",
  APPROVING = "approving",
  SIGNING = "signing",
  SUBMITTING = "submitting",
  SUCCESS = "success",
  FAILED = "failed",
  REJECTED = "rejected",
}
export type { Order, Token } from "@orbs-network/spot-ui";
export { OrderStatus, type OrderFill, OrderType, Module } from "@orbs-network/spot-ui";



export type CancelOrderProps = CancelOrderRequest;

export type ApproveTokenProps = ApprovalRequest;

export type WalletInteractions = {
  cancelOrder: (props: CancelOrderProps) => Promise<`0x${string}`>;
  signOrder: (request: OrderSigningRequest) => Promise<`0x${string}`>;
  wrapNativeToken: (amount: string) => Promise<`0x${string}`>;
  approveToken:  (props: ApproveTokenProps) => Promise<`0x${string}`>;
  getAllowance: (props: GetAllowanceProps) => Promise<string>;
};

export type GetAllowanceProps = AllowanceRequest;

export type InitialState = {
  isMarketOrder?: boolean;
  trades?: number;
  triggerPricePercent?: string | null;
  limitPricePercent?: string | null;
  fillDelay?: TimeDuration;
  duration?: TimeDuration;
  limitPrice?: string;
  triggerPrice?: string;
};



export enum Disclaimer {
  TRIGGER_MARKET_PRICE = "triggerMarketPriceDisclaimer",
  MARKET_PRICE = "marketOrderDisclaimer",
  LIMIT_PRICE = "limitOrderDisclaimer",
}


export type Overrides = {
  state?: Partial<InitialState>;
};

export type OnApproveSuccessCallback = {
  txHash: string;
  explorerUrl: string;
  token: Token;
  amount: string;
};

export type OnWrapSuccessCallback = {
  txHash: string;
  explorerUrl: string;
  amount: string;
};

export type OnCancelOrderSuccess = {
  order: Order;
  txHash: `0x${string}`;
  explorerUrl: string;
};

export type ParsedError = {
  message: string;
  code: number;
};

export type ObserverResult = void | PromiseLike<unknown>;

export type Callbacks = {
  onCancelOrderRequest?: (order: Order) => ObserverResult;
  onCancelOrderSuccess?: (props: OnCancelOrderSuccess) => ObserverResult;
  onCancelOrderFailed?: (error: Error) => ObserverResult;
  onOrdersProgressUpdate?: (orders: Order[]) => ObserverResult;
  onSignOrderRequest?: () => ObserverResult;
  onOrderCreated?: (order: Order) => ObserverResult;
  onSignOrderSuccess?: (signature: string) => ObserverResult;
  onSignOrderError?: (error: Error) => ObserverResult;
  onApproveRequest?: () => ObserverResult;
  onApproveSuccess?: (props: OnApproveSuccessCallback) => ObserverResult;
  onWrapRequest?: () => ObserverResult;
  onWrapSuccess?: (props: OnWrapSuccessCallback) => ObserverResult;
  onOrderFilled?: (order: Order) => ObserverResult;
  onCopy?: () => ObserverResult;
  onSubmitOrderFailed?: (error: ParsedError) => ObserverResult;
  onSubmitOrderRejected?: () => ObserverResult;

  onLimitPriceChange?: (typedLimitPrice: string) => ObserverResult;
  onTriggerPriceChange?: (typedTriggerPrice: string) => ObserverResult;
  onTriggerPricePercentChange?: (triggerPricePercent: string) => ObserverResult;
  onLimitPricePercentChange?: (limitPricePercent: string) => ObserverResult;
  onDurationChange?: (typedDuration?: TimeDuration) => ObserverResult;
  onFillDelayChange?: (typedFillDelay?: TimeDuration) => ObserverResult;
  onTradesChange?: (trades: number) => ObserverResult;
};


export type MarketReferencePrice = {
  value?: string;
  isLoading?: boolean;
  noLiquidity?: boolean;
};

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
  appId?: string;
  partner: Partners;
  inputToken?: Token;
  outputToken?: Token;
  inputUsd1Token?: string;
  outputUsd1Token?: string;
  inputBalance?: string;
  priceProtection: number;
  module: Module;
  marketReferencePrice: MarketReferencePrice;
  overrides?: Overrides;
  /** Display-only estimate; protocol fee collection is configured separately. */
  displayFeePercent?: number;
  callbacks?: Callbacks;
  minTradeSizeUsd: number;
  typedInputAmount: string;
  supportLegacyOrders?: boolean;
  /** Host-rendered, retryable UI for client initialization failures. */
  clientErrorFallback?: ComponentType<ClientErrorFallbackProps>;
  /** Host-rendered fallback for unexpected calculation or rendering errors. */
  errorFallback?: ComponentType<SpotErrorFallbackProps>;
}


export enum Steps {
  WRAP = "wrap",
  APPROVE = "approve",
  CREATE = "create",
}

export interface CompletedWrap {
  account: Address;
  chainId: number;
  inputTokenAddress: string;
  inputAmountWei: string;
  txHash: string;
}

export type SwapExecution = {
  executionId?: number;
  phase: ExecutionPhase;
  parsedError?: ParsedError;
  error?: Error;
  stepIndex?: number;
  approveTxHash?: string;
  wrapTxHash?: string;
  totalSteps?: number;
  pendingSteps?: Steps[];
  inputToken?: Token;
  outputToken?: Token;
  chainId?: number;
  orderId?: string;
  hasApproval?: boolean;
  form?: CalculatedOrderForm;
  preparedOrder?: PreparedOrder;
  completedWrap?: CompletedWrap;
};

export type StartedSwapExecution = SwapExecution & {
  executionId: number;
  phase: ExecutionPhase.PREPARING;
};

export interface State {
  typedTrades?: number;
  typedFillDelay?: TimeDuration;
  typedDuration?: TimeDuration;
  typedLimitPrice?: string;
  typedTriggerPrice?: string;
  triggerPricePercent?: string | null;
  isInvertedTrade?: boolean;
  limitPricePercent?: string | null;
  isMarketOrder?: boolean;

  cancelOrders: Record<string, {
    status: ExecutionStatus;
    txHash?: string;
    error?: string;
  }>;

  currentExecution: SwapExecution;
}

export { Partners };

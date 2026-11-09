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
  type OrderWalletInteractions,
  type PreparedOrder,
  type SpotClient,
  type SwapQuote,
  type Token,
} from "@orbs-network/spot-ui";
import type { SpotAnalytics } from "@orbs-network/spot-ui/internal";
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
  SETTLING = "settling",
  UNCONFIRMED = "unconfirmed",
  SUCCESS = "success",
  FAILED = "failed",
  REJECTED = "rejected",
}
export type { Order, Token } from "@orbs-network/spot-ui";
export { OrderStatus, type OrderFill, OrderType, Module } from "@orbs-network/spot-ui";



export type CancelOrderProps = CancelOrderRequest;

export type ApproveTokenProps = ApprovalRequest;

/** Shared SDK wallet operations plus confirmed order cancellation for React history. */
export type WalletInteractions = OrderWalletInteractions & {
  cancelOrder: (props: CancelOrderProps) => Promise<`0x${string}`>;
};

export type GetAllowanceProps = AllowanceRequest;

export type InitialState = {
  isMarketOrder?: boolean;
  tradeCount?: number;
  triggerPricePercent?: string | null;
  limitPricePercent?: string | null;
  tradeInterval?: TimeDuration;
  orderDuration?: TimeDuration;
  limitPriceUi?: string;
  triggerPriceUi?: string;
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
  token: Token;
  amount: string;
};

export type OnWrapSuccessCallback = {
  txHash: string;
  amount: string;
};

export type OnCancelOrderSuccess = {
  order: Order;
  txHash: `0x${string}`;
};

export type ParsedError = {
  message: string;
  code: number | string;
  reason?: "cancelled" | "expired" | "unconfirmed" | "aborted";
  orderId?: string;
  status?: number;
  serviceCode?: string | number;
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

  onLimitPriceChange?: (limitPriceUi: string) => ObserverResult;
  onTriggerPriceChange?: (triggerPriceUi: string) => ObserverResult;
  onTriggerPricePercentChange?: (triggerPricePercent: string) => ObserverResult;
  onLimitPricePercentChange?: (limitPricePercent: string) => ObserverResult;
  onOrderDurationChange?: (orderDuration?: TimeDuration) => ObserverResult;
  onTradeIntervalChange?: (tradeInterval?: TimeDuration) => ObserverResult;
  onTradeCountChange?: (tradeCount: number) => ObserverResult;
};


export type MarketQuote = {
  /** Optional SDK quote supplying market amounts and USD display values. */
  quote?: SwapQuote;
  quotedOutputAmountRaw?: string;
  /** Quoted minimum in output-token base units. */
  minimumOutputAmountRaw?: string;
  /** Exact USD value of the current input amount (quote.inputAmountUsd). */
  inputAmountUsd?: string;
  /** Exact USD value of the current net output quote. */
  quotedOutputAmountUsd?: string;
  /** Exact USD value of the current minimum output quote. */
  minimumOutputAmountUsd?: string;
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

/** Order modules supported by the React form provider. Swaps use the direct SDK client. */
export type AdvancedOrderModule = Exclude<Module, Module.SWAP>;

/** Inputs for advanced order forms, execution, cancellation, and history. */
export interface AdvancedOrdersProviderProps {
  children?: ReactNode;
  walletInteractions: WalletInteractions;
  chainId?: number;
  account?: Address;
  partner: Partners;
  /** Disable telemetry for this provider, including active operations. Defaults to false. */
  disableAnalytics?: boolean;
  inputToken?: Token;
  outputToken?: Token;
  /** Host-owned chain metadata used to normalize native input for order execution. */
  wrappedNativeToken: Token | undefined;
  /** Raw input-token balance; undefined represents a disconnected/loading state. */
  inputBalanceRaw: string | undefined;
  /** USD value of one input token; undefined represents a loading state. */
  inputTokenUsdPrice: string | undefined;
  outputTokenUsdPrice?: string;
  priceProtectionPercent: number;
  module: AdvancedOrderModule;
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


export enum Steps {
  WRAP = "wrap",
  APPROVE = "approve",
  CREATE = "create",
}

export interface CompletedWrap {
  account: Address;
  chainId: number;
  inputTokenAddress: string;
  inputAmountRaw: string;
  txHash: string;
}

export type SwapExecution = {
  executionId?: number;
  phase: ExecutionPhase;
  account?: Address;
  partner?: Partners;
  /** Original client retained for read-only settlement recovery after wallet changes. */
  client?: SpotClient;
  /** Captured order service for wallet-independent settlement and recovery. */
  apiUrl?: string;
  /** Reporter captured for this attempt, retained for wallet-independent status recovery. */
  analytics?: SpotAnalytics;
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
  /** Accepted order retained for status recovery without submitting another intent. */
  order?: Order;
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
  tradeCount?: number;
  tradeInterval?: TimeDuration;
  orderDuration?: TimeDuration;
  limitPriceUi?: string;
  triggerPriceUi?: string;
  triggerPricePercent?: string | null;
  isPriceInverted?: boolean;
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

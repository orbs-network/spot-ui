import {
  Partners,
  OrderType,
  Order,
  TimeDuration,
  type Address,
  type AllowanceRequest,
  type ApprovalRequest,
  type CalculatedOrderForm,
  type CancelOrderRequest,
  type OrderWalletInteractions,
  type OrderExecution as SdkOrderExecution,
  type PreparedOrder,
  type SpotClient,
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
export { OrderStatus, type OrderFill, OrderVariant, OrderType } from "@orbs-network/spot-ui";



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
  quotedOutputAmountRaw?: string;
  isLoading?: boolean;
  noLiquidity?: boolean;
};

export interface SpotErrorFallbackProps {
  error: Error;
  retry: () => Promise<void>;
  isRetrying: boolean;
}

/** Inputs for advanced order forms, execution, cancellation, and history. */
export interface AdvancedOrdersProviderProps {
  children?: ReactNode;
  walletInteractions: WalletInteractions;
  chainId?: number;
  account?: Address;
  partner: Partners;
  /** Disable analytics for clients created by this provider. Defaults to false. */
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
  orderType: OrderType;
  marketQuote: MarketQuote;
  overrides?: Overrides;
  /** Display-only estimate; protocol fee collection is configured separately. */
  displayFeePercent?: number;
  callbacks?: Callbacks;
  minTradeSizeUsd: number;
  inputAmountUi: string;
  supportLegacyOrders?: boolean;
  /** Host-rendered, retryable UI for client initialization or rendering failures. */
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
  wrappedTokenAddress: string;
  inputAmountRaw: string;
  txHash: string;
}

export type OrderExecutionState = {
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
  /** Lifecycle callbacks captured for this attempt, including background recovery. */
  callbacks?: Callbacks;
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
  /** SDK object owns confirmed wallet steps and the current prepared/accepted payload. */
  sdkExecution?: SdkOrderExecution;
  completedWrap?: CompletedWrap;
};

export type StartedOrderExecutionState = OrderExecutionState & {
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

  currentExecution: OrderExecutionState;
}

export { Partners };

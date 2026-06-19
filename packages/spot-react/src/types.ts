import { Partners, Module, Order, SpotConfig, TimeDuration, TWAP_ABI, REPERMIT_ABI } from "@orbs-network/spot-ui";
export enum SwapStatus {
  LOADING = 1,
  SUCCESS = 2,
  FAILED = 3,
}
export type { Order } from "@orbs-network/spot-ui";
export { OrderStatus, type OrderFill, OrderType, Module } from "@orbs-network/spot-ui";



export type SignOrderProps = {
  domain: Record<string, unknown>;
  types: Record<string, unknown[]>;
  primaryType: string;
  message: Record<string, unknown>;
  account: `0x${string}`;
};





export type CancelOrderProps = {
  order: Order
  contractAddress: string;
  args: string[] | string[][];
  abi: (typeof TWAP_ABI) | (typeof REPERMIT_ABI);
};

export type ApproveTokenProps = {
  tokenAddress: string;
  amount: string;
  spenderAddress: string;
};

export type WalletInteractions = {
  cancelOrder: (props: CancelOrderProps) => Promise<`0x${string}`>;
  signOrder: (props: SignOrderProps) => Promise<`0x${string}`>;
  wrapNativeToken: (amount: string) => Promise<`0x${string}`>;
  approveToken:  (props: ApproveTokenProps) => Promise<`0x${string}`>;
  getAllowance: (props: GetAllowanceProps) => Promise<string>;
};

export type GetAllowanceProps = {
  tokenAddress: string;
  spenderAddress: string;
};

export type InitialState = {
  isMarketOrder?: boolean;
  chunks?: number;
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

export type Callbacks = {
  onCancelOrderRequest?: (order: Order) => void;
  onCancelOrderSuccess?: (props: OnCancelOrderSuccess) => void;
  onCancelOrderFailed?: (error: Error) => void;
  onOrdersProgressUpdate?: (orders: Order[]) => void;
  onSignOrderRequest?: () => void;
  onOrderCreated?: (order: Order) => void;
  onSignOrderSuccess?: (signature: string) => void;
  onSignOrderError?: (error: Error) => void;
  onApproveRequest?: () => void;
  onApproveSuccess?: (props: OnApproveSuccessCallback) => void;
  onWrapRequest?: () => void;
  onWrapSuccess?: (props: OnWrapSuccessCallback) => void;
  onOrderFilled?: (order: Order) => void;
  onCopy?: () => void;
  onSubmitOrderFailed?: (error: ParsedError) => void;
  onSubmitOrderRejected?: () => void;

  onLimitPriceChange?: (typedLimitPrice: string) => void;
  onTriggerPriceChange?: (typedTriggerPrice: string) => void;
  onTriggerPricePercentChange?: (triggerPricePercent: string) => void;
  onLimitPricePercentChange?: (limitPricePercent: string) => void;
  onDurationChange?: (typedDuration?: TimeDuration) => void;
  onFillDelayChange?: (typedFillDelay?: TimeDuration) => void;
  onChunksChange?: (typedChunks: number) => void;
};


export type MarketReferencePrice = {
  value?: string;
  isLoading?: boolean;
  noLiquidity?: boolean;
};


export interface SpotProps {
  children?: React.ReactNode;
  walletInteractions: WalletInteractions;
  chainId?: number;
  account?: string;
  appId?: string;
  enableQueryParams?: boolean;
  partner: Partners;
  srcToken?: Token;
  dstToken?: Token;
  srcUsd1Token?: string;
  dstUsd1Token?: string;
  srcBalance?: string;
  dstBalance?: string;
  priceProtection: number;
  module: Module;
  marketReferencePrice: MarketReferencePrice;
  overrides?: Overrides;
  fees?: number;
  callbacks?: Callbacks;
  minChunkSizeUsd: number;
  typedInputAmount: string;
  isDev?: boolean;
}

export interface SpotContextType {
  walletInteractions?: WalletInteractions;
  marketPrice?: string;
  marketPriceLoading?: boolean;
  account?: `0x${string}`;
  noLiquidity?: boolean;
  config: SpotConfig;
  supportedChains: number[];
  typedInputAmount: string;
  partner: Partners;
  minChunkSizeUsd: number;
  srcToken?: Token;
  dstToken?: Token;
  srcUsd1Token?: string;
  dstUsd1Token?: string;
  srcBalance?: string;
  dstBalance?: string;
  chainId: number;
  slippage: number;
  fees: number;
  module: Module;
  overrides?: Overrides;
  callbacks?: Callbacks;
  isDev?: boolean;
}


export type Token = {
  address: string;
  symbol: string;
  decimals: number;
  logoUrl: string;
};

export enum Steps {
  WRAP = "wrap",
  APPROVE = "approve",
  CREATE = "create",
}
export type SwapExecution = {
  status?: SwapStatus;
  parsedError?: ParsedError;
  error?: Error;
  step?: Steps;
  stepIndex?: number;
  approveTxHash?: string;
  wrapTxHash?: string;
  totalSteps?: number;
  pendingSteps?: Steps[];
  srcToken?: Token;
  dstToken?: Token;
  orderId?: string;
  allowanceLoading?: boolean;
  hasApproval?: boolean;
  acceptedSrcAmount?: string;
  acceptedMarketPrice?: string;
};

export interface State {
  typedChunks?: number;
  typedFillDelay?: TimeDuration;
  typedDuration?: TimeDuration;
  typedLimitPrice?: string;
  typedTriggerPrice?: string;
  triggerPricePercent?: string | null;
  isInvertedTrade?: boolean;
  limitPricePercent?: string | null;
  isMarketOrder?: boolean;

  currentTime: number;
  cancelOrders: Record<string, {
    status: SwapStatus;
    txHash?: string;
    error?: string;
  }>;

  swapExecutions: SwapExecution[];
  swapExecutionIndex: number;
}

export { Partners };

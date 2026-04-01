import { Partners, Module, Order, SpotConfig, TimeDuration } from "@orbs-network/spot-ui";
export enum SwapStatus {
  LOADING = 1,
  SUCCESS = 2,
  FAILED = 3,
}
import { createPublicClient, createWalletClient, TransactionReceipt as _TransactionReceipt, Abi } from "viem";
export type { Order } from "@orbs-network/spot-ui";
export { OrderStatus, type OrderFill, OrderType, Module } from "@orbs-network/spot-ui";



export interface Provider {
  request(...args: any): Promise<any>;
  [key: string]: any; // Allow extra properties
}

export type PublicClient = ReturnType<typeof createPublicClient>;
export type WalletClient = ReturnType<typeof createWalletClient>;

export type ApproveProps = {
  tokenAddress: string;
  amount: bigint;
  spenderAddress: string;
};

export type CreateOrderProps = {
  contractAddress: string;
  abi: Abi;
  functionName: string;
  args: [string[]];
};

export type CancelOrderProps = {
  contractAddress: string;
  abi: Abi;
  functionName: string;
  args: number[];
  orderId: number;
};

export type GetAllowanceProps = {
  tokenAddress: string;
  spenderAddress: string;
};

export type InitialState = {
  isMarketOrder?: boolean;
  inputAmount?: string;
  chunks?: number;
  fillDelay?: TimeDuration;
  duration?: TimeDuration;
  limitPrice?: string;
  triggerPrice?: string;
};




export type Overrides = {
  wrap?: (amountWei: string) => Promise<`0x${string}`>;
  approveOrder?: (props: ApproveProps) => Promise<`0x${string}`>;
  createOrder?: (props: CreateOrderProps) => Promise<`0x${string}`>;
  getAllowance?: (props: GetAllowanceProps) => Promise<string>;
  state?: Partial<InitialState>;
  numberFormat?: (value: number | string) => string;
  dateFormat?: (date: number) => string;
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
  orders: Order[];
  txHash: string;
  explorerUrl: string;
};

export type ParsedError = {
  message: string;
  code: number;
};

export type Callbacks = {
  onCancelOrderRequest?: (orders: Order[]) => void;
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
  provider?: Provider;
  chainId?: number;
  account?: string;
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
  walletClient?: ReturnType<typeof createWalletClient>;
  publicClient?: PublicClient;
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
  orderId?: string;
  allowanceLoading?: boolean;
  acceptedMarketPrice?: string;
  acceptedSrcAmount?: string;
  srcToken?: Token;
  dstToken?: Token;
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
  cancelOrderStatus?: SwapStatus;
  cancelOrderTxHash?: string;
  cancelOrderError?: string;
  cancelOrderId?: number;

  swapExecutions: SwapExecution[];
  swapExecutionIndex: number;
}

export { Partners };

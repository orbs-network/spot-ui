export interface QuoteArgs {
  /** Input token address. Use the wrapped-token address for native input. */
  fromToken: string;
  /** Output token address. */
  toToken: string;
  /** Input amount in base units as a positive integer string. */
  inAmount: string;
  /** DEX route's minimum output in base units, or `-1` when unavailable. */
  dexMinAmountOut?: string;
  /** Connected wallet address. Required when the quote may be executed. */
  account?: string;
  /** Percentage value, for example `0.5` means 0.5%. */
  slippage: number;
  /** Cancels the underlying request. */
  signal?: AbortSignal;
  /** Request timeout in milliseconds. Defaults to 10 seconds. */
  timeout?: number;
  /** Optional input USD value used only for analytics. */
  inAmountUsd?: number;
  /** @deprecated Prevent disabled requests in the host instead. */
  disabled?: boolean;
}

export interface DexRouterData {
  data?: string;
  to?: string;
}

export interface Eip712Field {
  name: string;
  type: string;
}

export interface Eip712Domain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: `0x${string}`;
  salt?: `0x${string}`;
}

/** Legacy Permit2 representation retained in the quote response. */
export interface QuotePermitData {
  domain: Eip712Domain;
  types: Record<string, Eip712Field[]>;
  values: Record<string, unknown>;
  primaryType?: string;
}

/** Wallet-ready EIP-712 payload returned with a quote. */
export interface QuoteEip712 {
  domain: Eip712Domain;
  types: Record<string, Eip712Field[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface Quote {
  inToken: string;
  outToken: string;
  inAmount: string;
  outAmount: string;
  user: `0x${string}`;
  slippage: number;
  qs: string;
  partner: string;
  exchange: string;
  sessionId: string;
  serializedOrder: string;
  permitData: QuotePermitData;
  /** Wallet-ready typed data to pass to `signTypedData`. */
  eip712: QuoteEip712;
  minAmountOut: string;
  error?: string;
  gasAmountOut?: string;
  referencePrice?: string;
  userMinOutAmountWithGas: string;
  outAmountWsMinusGas: string;
  outAmountWS: string;
  /** Client receipt time in milliseconds. */
  timestamp: number;
}

export interface LiquidityHubClientOptions {
  /** Active EVM chain ID. */
  chainId: number;
  /** Stable DEX identifier. It is normalized to lowercase. */
  partner: string;
  /**
   * Optional Liquidity Hub API base URL. Relative URLs are supported for
   * same-origin development proxies, for example `/api/liquidity-hub`.
   */
  apiUrl?: string;
  /** Disables Orbs telemetry for this client when true. */
  blockAnalytics?: boolean;
}

export interface DexSwapAnalyticsParams {
  panel: string;
  router: string;
  srcTokenAddress: string;
  dstTokenAddress: string;
  inAmount: string;
  inAmountUsd?: number;
  txHash: string;
}

export interface AnalyticsStageCallbacks {
  onRequest(): void;
  onSuccess(txHash?: string): void;
  onFailed(error: string): void;
}

export interface LiquidityHubAnalytics {
  readonly liquidityHubId: string;
  readonly swap: {
    onSuccess(): void;
    onFailed(error: string): void;
  };
  readonly dexSwap: (params: DexSwapAnalyticsParams) => void;
  readonly wrap: AnalyticsStageCallbacks;
  readonly approval: AnalyticsStageCallbacks;
  readonly signature: {
    onRequest(): void;
    /** The argument remains accepted for backwards compatibility but is not recorded. */
    onSuccess(signature: string): void;
    onFailed(error: string): void;
  };
}

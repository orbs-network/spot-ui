export type Config = {
  chainName: string;
  chainId: number;
  twapVersion: number;
  twapAddress: string;
  lensAddress: string;
  bidDelaySeconds: number;
  minChunkSizeUsd: number;
  name: string;
  partner: string;
  exchangeAddress: string;
  exchangeType: string;
  pathfinderKey?: string;
};

export type Token = {
  address: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
};

export enum Module {
  /** One limit order from a live quote; fixed 5% signed protection, host-owned minimum output. */
  SWAP = "SWAP",
  TWAP = "TWAP",
  LIMIT = "LIMIT",
  STOP_LOSS = "STOP_LOSS",
  TAKE_PROFIT = "TAKE_PROFIT",
}

export enum OrderStatus {
  /** Accepted and awaiting execution; may already contain partial fills. */
  Open = "OPEN",
  /** Cancelled before full completion; inspect `fills` for any partial execution. */
  Cancelled = "CANCELLED",
  /** Fully executed, as reported by the order service. */
  Completed = "COMPLETED",
  /** Expired before full completion; inspect `fills` for any partial execution. */
  Expired = "EXPIRED",
}

export enum OrderFilter {
  All = "ALL",
  Open = "OPEN",
  Cancelled = "CANCELLED",
  Completed = "COMPLETED",
  Expired = "EXPIRED",
}

export enum TimeUnit {
  Minutes = 60 * 1000,
  Hours = Minutes * 60,
  Weeks = 7 * 24 * Hours,
  Days = Hours * 24,
  Months = 30 * Days,
  Years = 365 * Days,
}

export type TimeDuration = { unit: TimeUnit; value: number };

export enum OrderType {
  LIMIT = "limit",
  TWAP_LIMIT = "twap-limit",
  TWAP_MARKET = "twap-market",
  TAKE_PROFIT_MARKET = "take-profit-market",
  TAKE_PROFIT_LIMIT = "take-profit-limit",
  STOP_LOSS_LIMIT = "stop-loss-limit",
  STOP_LOSS_MARKET = "stop-loss-market",
}

export type FillV1 = {
  /** The Graph serializes BigInt scalar values as strings. */
  TWAP_id: string;
  dollarValueIn: string;
  dollarValueOut: string;
  dstAmountOut: string;
  dstFee: string;
  id: string;
  srcAmountIn: string;
  srcFilledAmount: string;
  timestamp: number;
  twapAddress: string;
  exchange: string;
  transactionHash: string;
};

/** One successful execution of part or all of an order. */
export type OrderFill = {
  /** Input-token amount spent, in integer base units. */
  inAmount: string;
  /** Output-token amount received, in integer base units. */
  outAmount: string;
  /** Execution time as Unix milliseconds. */
  timestamp: number;
  /** On-chain transaction hash for this fill. */
  txHash: string;
};

/** Normalized order from submission, a status lookup, or account history. */
export type Order = {
  /** V2 digest used for on-chain cancellation; empty for legacy V1 orders. */
  repermitDigest: string;
  /** Protocol version: 1 for legacy TWAP contracts, 2 for signed RePermit orders. */
  version: number;
  /** Stable history identity across versions and legacy contract deployments. */
  historyKey: string;
  /** Full signed hash for V2 lookups; legacy V1 orders use a contract-local numeric ID. */
  id: string;
  /** Signed hash for V2; empty for legacy V1 orders. */
  hash: string;
  type: OrderType;
  exchangeAddress?: string;
  twapAddress?: string;
  /** Account that owns the order's input tokens. */
  maker: string;
  /** Reported execution progress from 0 to 100. Use `status` to confirm completion. */
  progress: number;
  /** Total input spent by successful fills, in input-token base units. */
  srcAmountFilled: string;
  /** Total output received from successful fills, in output-token base units. */
  dstAmountFilled: string;
  /** Successful fills, including any partial execution before cancellation or expiration. */
  fills: OrderFill[];
  srcTokenAddress: string;
  dstTokenAddress: string;
  orderDollarValueIn: string;
  fillDelay: number;
  /** Signed expiration as Unix milliseconds; used by `waitForOrder` and `watchOrder`. */
  deadline: number;
  /** Order-service creation time as Unix milliseconds. */
  createdAt: number;
  /** Total requested input amount in integer input-token base units. */
  srcAmount: string;
  dstMinAmountPerTrade: string;
  triggerPricePerTrade: string;
  dstMinAmountTotal: string;
  srcAmountPerTrade: string;
  txHash?: string;
  /** Expected number of executions; swaps have one. */
  totalTradesAmount: number;
  isMarketPrice: boolean;
  /** EVM chain on which the order executes. */
  chainId: number;
  /** Last fill time as Unix milliseconds when fully filled, otherwise zero. */
  filledOrderTimestamp: number;
  /** Service-reported lifecycle state; submission alone does not imply `Completed`. */
  status: OrderStatus;
  /** Original service payload. Its protocol fields retain their original units. */
  rawOrder: OrderV2 | OrderV1;
  isTriggerPrice: boolean;
};

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** Unsigned protocol payload returned by preparation and submitted with its original signature. */
export interface RePermitOrder {
  permitted: {
    token: Address;
    amount: string;
  };
  spender: Address;
  nonce: string;
  /** Protocol expiration as Unix seconds, unlike normalized `Order.deadline` in milliseconds. */
  deadline: string;
  witness: {
    reactor: Address;
    executor: Address;
    exchange: {
      adapter: Address;
      ref: Address;
      share: number;
      data: Hex;
    };
    swapper: Address;
    nonce: string;
    deadline: string;
    chainid: number;
    start?: string;
    exclusivity: number;
    epoch: number;
    slippage: number;
    freshness: number;
    input: {
      token: Address;
      amount: string;
      maxAmount: string;
    };
    output: {
      token: Address;
      limit: string;
      stop?: string;
      triggerLower?: string;
      triggerUpper?: string;
      recipient: Address;
    };
  };
}

export type RePermitData = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  order: RePermitOrder;
  partner?: string;
  primaryType: string;
  types: Record<string, { name: string; type: string }[]>;
};

export type Signature = {
  v: `0x${string}`;
  r: `0x${string}`;
  s: `0x${string}`;
};

export type OrderV1 = {
  Contract_id: string | number;
  srcTokenSymbol: string;
  dollarValueIn: string;
  blockNumber: number;
  maker: string;
  dstTokenSymbol: string;
  ask_fillDelay: number;
  exchange: string;
  twapAddress: string;
  dex: string;
  ask_deadline: number;
  timestamp: string;
  ask_srcAmount: string;
  ask_dstMinAmount: string;
  ask_srcBidAmount: string;
  transactionHash: string;
  ask_srcToken: string;
  ask_dstToken: string;
};

type OrderV2Chunk = {
  blockId: number;
  description: string;
  epoch: string;
  exchange: string;
  executor: string;
  inAmount: string;
  inToken: string;
  index: number;
  minOut: string;
  oraclePricingData: {
    message: {
      chainid: number;
      cosigner: string;
      input: {
        decimals: string;
        token: string;
        value: "1000000000000000000";
      };
      output: {
        decimals: string;
        token: string;
        value: string;
      };
      reactor: string;
      timestamp: number;
    };
    oracle: string;
    signature: Signature;
    timestamp: string;
  };
  outAmount: string;
  outToken: string;
  settled: boolean;
  status: string;
  swapper: string;
  timestamp: string;
  txHash: string;
};

export type GetV1OrdersFilters = {
  transactionHashes?: string[];
  orderIds?: number[];
  accounts?: string[];
  configs?: Config[];
  inTokenSymbols?: string[];
  outTokenSymbols?: string[];
  inTokenAddresses?: string[];
  outTokenAddresses?: string[];
  minDollarValueIn?: number;
  startDate?: number;
  endDate?: number;
  orderType?: "limit" | "market";
};

export type OrderV2 = {
  hash: string;
  metadata: {
    chunks?: OrderV2Chunk[];
    expectedChunks: number;
    lastPriceCheck: string;
    nextEligibleTime: string;
    status: string;
    description: string;
    displayOnlyInputTokenPriceUSD: string;
    repermitDigest: string;
  };
  order: RePermitOrder;
  signature: string;
  timestamp: string;
};

export enum Partners {
  Arbidex = "arbidex",
  Blackhole = "blackhole",
  Chronos = "chronos",
  Dragon = "dragon",
  Kodiak = "kodiak",
  Lynex = "lynex",
  Nami = "nami",
  Newera = "newera",
  Omni = "omni",
  Pancake = "pancake",
  Quick = "quick",
  Ramses = "ramses",
  Shadow = "shadow",
  Spark = "spark",
  Spooky = "spooky",
  Swapx = "swapx",
  Teafi = "teafi",
  Thena = "thena",
  Yowie = "yowie",
  Pangolin = "pangolin",
  Sushiswap = "sushiswap",
  Agent = "agent",
  Utila = "utila",
  Ring = "ring",
  EfficientFrontier = "ef",
  HtDigital = "ht",
  Ginco = "ginco",
  Katana = "katana",
  External = "external",
  Orvex = "orvex",
  Listed = "listed",
}

export enum InputErrors {
  MAX_TRADES = "maxTradesError",
  MIN_TRADES = "minTradesError",
  MIN_TRADE_SIZE = "minTradeSizeError",
  MAX_FILL_DELAY = "maxFillDelayError",
  MIN_FILL_DELAY = "minFillDelayError",
  MAX_ORDER_DURATION = "maxDurationError",
  MIN_ORDER_DURATION = "minDurationError",
  MISSING_LIMIT_PRICE = "missingLimitPrice",
  STOP_LOSS_TRIGGER_PRICE_GREATER_THAN_MARKET_PRICE = "StopLossTriggerPriceError",
  TRIGGER_LIMIT_PRICE_GREATER_THAN_TRIGGER_PRICE = "triggerLimitPriceError",
  TAKE_PROFIT_TRIGGER_PRICE_LESS_THAN_MARKET_PRICE = "TakeProfitTriggerPriceError",
  EMPTY_TRIGGER_PRICE = "emptyTriggerPrice",
  INSUFFICIENT_BALANCE = "insufficientFunds",
  MAX_ORDER_SIZE = "maxOrderSize",
  /** A swap minimum is missing, invalid, or greater than the quoted output. */
  INVALID_SWAP_MINIMUM = "invalidSwapMinimum",
}

export type InputError = {
  type: InputErrors;
  value: string | number;
  args?: Record<string, string>;
};

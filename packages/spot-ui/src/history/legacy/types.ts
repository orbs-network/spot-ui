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

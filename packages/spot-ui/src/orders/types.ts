import { type OrderV2 } from "../history/current/types";
import { type OrderV1 } from "../history/legacy/types";

export enum OrderStatus {
  Open = "OPEN",
  Cancelled = "CANCELLED",
  Completed = "COMPLETED",
  Expired = "EXPIRED",
}

export enum OrderFilter {
  All = "ALL",
  Open = "OPEN",
  Cancelled = "CANCELLED",
  Completed = "COMPLETED",
  Expired = "EXPIRED",
}

export enum OrderType {
  LIMIT = "limit",
  TWAP_LIMIT = "twap-limit",
  TWAP_MARKET = "twap-market",
  TAKE_PROFIT_MARKET = "take-profit-market",
  TAKE_PROFIT_LIMIT = "take-profit-limit",
  STOP_LOSS_LIMIT = "stop-loss-limit",
  STOP_LOSS_MARKET = "stop-loss-market",
}

export type OrderFill = {
  inAmount: string;
  outAmount: string;
  timestamp: number;
  txHash: string;
};

export type Order = {
  repermitDigest: string;
  version: number;
  /** Stable history identity across versions and legacy contract deployments. */
  historyKey: string;
  id: string;
  hash: string;
  type: OrderType;
  exchangeAddress?: string;
  twapAddress?: string;
  maker: string;
  progress: number;
  srcAmountFilled: string;
  dstAmountFilled: string;
  fills: OrderFill[];
  srcTokenAddress: string;
  dstTokenAddress: string;
  orderDollarValueIn: string;
  fillDelay: number;
  deadline: number;
  createdAt: number;
  srcAmount: string;
  dstMinAmountPerTrade: string;
  triggerPricePerTrade: string;
  dstMinAmountTotal: string;
  srcAmountPerTrade: string;
  txHash?: string;
  totalTradesAmount: number;
  isMarketPrice: boolean;
  chainId: number;
  filledOrderTimestamp: number;
  status: OrderStatus;
  rawOrder: OrderV2 | OrderV1;
  isTriggerPrice: boolean;
};

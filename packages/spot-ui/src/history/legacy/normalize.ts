import BN from "bignumber.js";
import {
  OrderStatus,
  OrderType,
  type Order,
  type OrderFill,
} from "../../orders/types";
import type { FillV1, OrderV1 } from "./types";
export type RawStatus = "CANCELLED" | "COMPLETED" | null;

const parseFills = (fills: FillV1[]): OrderFill[] => {
  return fills.map((fill) => ({
    inAmount: fill.srcAmountIn,
    outAmount: fill.dstAmountOut,
    timestamp: fill.timestamp,
    txHash: fill.transactionHash,
  }));
};

const getOrderType = (ask_dstMinAmount: string, chunks: number) => {
  const isLimit = BN(ask_dstMinAmount || 0).gt(1);

  if (!isLimit && chunks === 1) {
    return OrderType.TWAP_MARKET;
  }
  if (chunks > 1 && isLimit) {
    return OrderType.TWAP_LIMIT;
  }

  if (isLimit) {
    return OrderType.LIMIT;
  }

  return OrderType.TWAP_MARKET;
};

export const buildV1Order = (
  order: OrderV1,
  chainId: number,
  fills: FillV1[],
  status: RawStatus | undefined,
): Order => {
  const parsedFills = parseFills(fills || ([] as FillV1[]));
  const bidAmount = new BN(order.ask_srcBidAmount || 0);
  const chunks = bidAmount.gt(0)
    ? Math.max(
        1,
        new BN(order.ask_srcAmount || 0)
          .div(bidAmount)
          .integerValue(BN.ROUND_CEIL)
          .toNumber(),
      )
    : 1;
  const isFilled = fills?.length >= chunks;
  const filledOrderTimestamp = isFilled
    ? parsedFills.reduce(
        (latestTimestamp, fill) => Math.max(latestTimestamp, fill.timestamp),
        0,
      )
    : undefined;
  const filledSrcAmount = parsedFills
    .reduce((acc, fill) => acc.plus(fill.inAmount), new BN(0))
    .toFixed();
  const filledDstAmount = parsedFills
    .reduce((acc, fill) => acc.plus(fill.outAmount), new BN(0))
    .toFixed();
  const progress = getV1OrderProgress(order.ask_srcAmount, filledSrcAmount);
  const type = getOrderType(order.ask_dstMinAmount, chunks);
  return {
    repermitDigest: "",
    version: 1,
    historyKey: `1:${chainId}:${order.twapAddress.toLowerCase()}:${order.Contract_id}`,
    isTriggerPrice: false,
    id: order.Contract_id.toString(),
    hash: "",
    type,
    srcTokenAddress: order.ask_srcToken,
    dstTokenAddress: order.ask_dstToken,
    exchangeAddress: order.exchange,
    twapAddress: order.twapAddress,
    maker: order.maker,
    progress,
    dstAmountFilled: filledDstAmount,
    srcAmountFilled: filledSrcAmount,
    orderDollarValueIn: BN(order.dollarValueIn || 0).toFixed(6),
    srcAmount: order.ask_srcAmount,
    dstMinAmountTotal: BN(order.ask_dstMinAmount)
      .multipliedBy(chunks)
      .toString(),
    fills: parsedFills,
    fillDelay: order.ask_fillDelay,
    deadline: order.ask_deadline * 1000,
    createdAt: new Date(order.timestamp).getTime(),
    dstMinAmountPerTrade: BN(order.ask_dstMinAmount).eq(1)
      ? ""
      : order.ask_dstMinAmount,
    triggerPricePerTrade: "",
    srcAmountPerTrade: order.ask_srcBidAmount,
    txHash: order.transactionHash,
    totalTradesAmount: chunks,
    isMarketPrice: [OrderType.TWAP_MARKET].includes(type),
    chainId,
    filledOrderTimestamp: filledOrderTimestamp || 0,
    status: parseOrderStatus(progress, order.ask_deadline * 1000, status),
    rawOrder: order,
  };
};

export const getV1OrderProgress = (
  srcAmount: string,
  filledSrcAmount: string,
) => {
  const total = BN(srcAmount || 0);
  const filled = BN(filledSrcAmount || 0);
  if (!total.isFinite() || !filled.isFinite() || total.lte(0)) return 0;
  const progress = filled.dividedBy(total).toNumber();

  if (progress >= 1) return 100;
  if (progress <= 0) return 0;

  return Number((progress * 100).toFixed(2));
};

const parseOrderStatus = (
  progress: number,
  deadline: number,
  status?: RawStatus,
): OrderStatus => {
  if (progress === 100) return OrderStatus.Completed;
  if (status === "CANCELLED") return OrderStatus.Cancelled;
  if (status === "COMPLETED") return OrderStatus.Completed;

  if (deadline > Date.now()) return OrderStatus.Open;

  return OrderStatus.Expired;
};

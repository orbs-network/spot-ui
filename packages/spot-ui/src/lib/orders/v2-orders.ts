/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-constant-condition */
import { getApiEndpoint } from "../consts";
import { OrderStatus, OrderType, OrderV2, Order, OrderFill } from "../types";
import BN from "bignumber.js";

const getOrderType = (order: OrderV2) => {
  const isLimit = BN(order.order.witness.output.limit || 0).gt(1);
  const isTriggerPrice = BN(order.order.witness.output.stop || 0).gt(0);
  const chunks =
    order.metadata.chunks?.length ||
    BN(order.order.witness.input.maxAmount)
      .div(BN(order.order.witness.input.amount))
      .toNumber();

  if (isTriggerPrice && isLimit) {
    return OrderType.TRIGGER_PRICE_LIMIT;
  }

  if (isTriggerPrice) {
    return OrderType.TRIGGER_PRICE_MARKET;
  }

  if (!isLimit && chunks <= 1) {
    return OrderType.TWAP_MARKET;
  }
  if (chunks >= 1 && isLimit) {
    return OrderType.TWAP_LIMIT;
  }

  if (isLimit) {
    return OrderType.LIMIT;
  }

  return OrderType.TWAP_MARKET;
};

const getProgress = (order: OrderV2) => {
  const successChunks =
    order.metadata.chunks?.filter((chunk) => chunk.status === "success")
      .length || 0;
  const totalChunks = order.metadata.expectedChunks || 0;
  const progress = BN(successChunks).dividedBy(totalChunks).toNumber();

  if (progress >= 0.99) return 100;
  if (progress <= 0) return 0;

  return Number((progress * 100).toFixed(2));
};

const getStatus = (order: OrderV2, progress: number) => {
  if (order.metadata.status === "completed" || progress >= 99)
    return OrderStatus.Completed;
  if (["pending", "eligible"].includes(order.metadata.status))
    return OrderStatus.Open;
  if (order.metadata.description.toLowerCase() === "cancelled by contract")
    return OrderStatus.Canceled;

  return OrderStatus.Expired;
};

const getFills = (order: OrderV2): OrderFill[] => {
  const chunks =
    order.metadata.chunks?.filter((chunk) => chunk.status === "success") || [];
  return chunks.map((chunk) => ({
    inAmount: chunk.inAmount,
    outAmount: chunk.outAmount,
    timestamp: new Date(chunk.timestamp).getTime(),
    txHash: chunk.txHash,
  }));
};

const getFilledOrderTimestamp = (
  fills: OrderFill[],
  totalTradesAmount: number,
) => {
  const totalFilled = fills.length;
  if (totalFilled >= totalTradesAmount) {
    return fills[totalFilled - 1]?.timestamp || 0;
  }
  return 0;
};

const getOrderDollarValueIn = (order: OrderV2) => {
  return BN(order.metadata.displayOnlyInputTokenPriceUSD)
    .dividedBy(1e18)
    .toFixed();
};

export const buildV2Order = (order: OrderV2): Order => {
  const progress = getProgress(order);
  console.log(getOrderDollarValueIn(order));

  const dstMinAmountPerTrade =
    Number(order.order.witness.output.limit) === 1
      ? ""
      : order.order.witness.output.limit;
  const totalTradesAmount = order.metadata.expectedChunks || 1;
  const fills = getFills(order);
  return {
    id: order.hash,
    hash: order.hash,
    version: 2,
    type: getOrderType(order),
    maker: order.order.witness.swapper,
    progress,
    srcAmountFilled:
      fills
        .reduce((acc, fill) => acc.plus(fill.inAmount), new BN(0))
        .toFixed() || "",
    dstAmountFilled:
      fills
        .reduce((acc, fill) => acc.plus(fill.outAmount), new BN(0))
        .toFixed() || "",
    fills,
    srcTokenAddress: order.order.witness.input.token,
    dstTokenAddress: order.order.witness.output.token,
    orderDollarValueIn: getOrderDollarValueIn(order),
    fillDelay: order.order.witness.epoch * 1000,
    deadline: Number(order.order.deadline) * 1000,
    createdAt: new Date(order.timestamp).getTime(),
    srcAmount: order.order.witness.input.maxAmount,
    dstMinAmountPerTrade,
    triggerPricePerTrade: BN(order.order.witness.output.stop || 0).isZero()
      ? ""
      : order.order.witness.output.stop,
    dstMinAmountTotal: BN(dstMinAmountPerTrade)
      .multipliedBy(totalTradesAmount)
      .toString(),
    srcAmountPerTrade: order.order.witness.input.amount,
    totalTradesAmount,
    isMarketPrice: BN(dstMinAmountPerTrade || 0).lte(1),
    chainId: order.order.witness.chainid,
    filledOrderTimestamp: getFilledOrderTimestamp(fills, totalTradesAmount),
    status: getStatus(order, progress),
    rawOrder: order,
  };
};

export const getOrders = async ({
  chainId,
  signal,
  account,
}: {
  chainId: number;
  signal?: AbortSignal;
  account?: string;
}): Promise<Order[]> => {
  if (!account) return [];
  const response = await fetch(
    `${getApiEndpoint()}/orders?swapper=${account}&chainId=${chainId}`,
    {
      signal,
    },
  );

  const payload = (await response.json()) as { orders: OrderV2[] };

  return payload.orders.map(buildV2Order);
};

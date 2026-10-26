/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-constant-condition */
import {
  getOrderApiEndpoints,
  getApiEndpoint,
} from "../api-config";
import { MAX_UINT_256 } from "../evm-constants";
import {
  OrderStatus,
  OrderType,
  OrderV2,
  Order,
  OrderFill,
  Partners,
} from "../types";
import BN from "bignumber.js";
import { SpotError } from "../errors";

const getOrderType = (order: OrderV2) => {
  const isLimit = BN(order.order.witness.output.limit || 0).gt(1);
  const { stop, triggerLower, triggerUpper } = order.order.witness.output;

  const isLegacyTakeProfit = BN(stop || 0).eq(MAX_UINT_256);
  const isTakeProfit =
    isLegacyTakeProfit || BN(triggerUpper || 0).gt(0);
  const isStopLoss =
    (!isLegacyTakeProfit && BN(stop || 0).gt(0)) ||
    BN(triggerLower || 0).gt(0);
  const chunkAmount = BN(order.order.witness.input.amount);
  const chunks =
    order.metadata.expectedChunks ||
    (chunkAmount.gt(0)
      ? BN(order.order.witness.input.maxAmount).div(chunkAmount).toNumber()
      : 1);

  if (isTakeProfit) {
    return isLimit ? OrderType.TAKE_PROFIT_LIMIT : OrderType.TAKE_PROFIT_MARKET;
  }

  if (isStopLoss) {
    return isLimit ? OrderType.STOP_LOSS_LIMIT : OrderType.STOP_LOSS_MARKET;
  }

  if (!isLimit) {
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

const getProgress = (order: OrderV2) => {
  const successChunks =
    order.metadata.chunks?.filter((chunk) => chunk.status === "success")
      .length || 0;
  const totalChunks = order.metadata.expectedChunks || 0;
  if (!totalChunks) return 0;
  const progress = BN(successChunks).dividedBy(totalChunks).toNumber();

  if (successChunks >= totalChunks) return 100;
  if (progress <= 0) return 0;

  return Number((progress * 100).toFixed(2));
};

const getStatus = (order: OrderV2, progress: number) => {
  const status = (order.metadata.status || "").toLowerCase();
  const description = order.metadata.description?.toLowerCase();

  if (status === "completed" || progress === 100)
    return OrderStatus.Completed;
  if (["pending", "eligible"].includes(status))
    return OrderStatus.Open;
  if (
    ["cancelled", "canceled"].includes(status) ||
    description === "cancelled by contract" ||
    description === "canceled by contract"
  )
    return OrderStatus.Cancelled;

  return OrderStatus.Expired;
};

const getFills = (order: OrderV2): OrderFill[] => {
  const chunks =
    order.metadata.chunks?.filter((chunk) => chunk.status === "success") || [];
  return chunks
    .map((chunk) => ({
      inAmount: chunk.inAmount,
      outAmount: chunk.outAmount,
      timestamp: new Date(chunk.timestamp).getTime(),
      txHash: chunk.txHash,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
};

const getFilledOrderTimestamp = (
  fills: OrderFill[],
  totalTradesAmount: number,
) => {
  const totalFilled = fills.length;
  if (totalFilled >= totalTradesAmount) {
    return fills.reduce(
      (latestTimestamp, fill) => Math.max(latestTimestamp, fill.timestamp),
      0,
    );
  }
  return 0;
};

const getOrderDollarValueIn = (order: OrderV2) => {
  const amount = BN(order.metadata.displayOnlyInputTokenPriceUSD || 0);
  return amount.isFinite() ? amount.dividedBy(1e18).toFixed() : "0";
};

const getDstMinAmountPerTrade = (order: OrderV2) => {
  return BN(order.order.witness.output.limit || 0).eq(1)
    ? ""
    : order.order.witness.output.limit;
};

type Amounts = {
  dstMinAmountPerTrade: string;
  triggerPricePerTrade: string;
  dstMinAmountTotal: string;
};

const getAmounts = (order: OrderV2): Amounts => {
  const { triggerLower = "0", triggerUpper = "0" } = order.order.witness.output;

  const dstMinAmountPerTrade = getDstMinAmountPerTrade(order);
  const totalTradesAmount = order.metadata.expectedChunks || 1;
  const isTakeProfitOrder = BN(triggerUpper || 0).gt(0);

  return {
    dstMinAmountPerTrade,
    triggerPricePerTrade: isTakeProfitOrder ? triggerUpper : triggerLower,
    dstMinAmountTotal: dstMinAmountPerTrade
      ? BN(dstMinAmountPerTrade).multipliedBy(totalTradesAmount).toFixed()
      : "",
  };
};

export const buildV2Order = (order: OrderV2): Order => {
  const progress = getProgress(order);

  const dstMinAmountPerTrade = getDstMinAmountPerTrade(order);
  const totalTradesAmount = order.metadata.expectedChunks || 1;
  const fills = getFills(order);
  const type = getOrderType(order);
  return {
    id: order.hash,
    hash: order.hash,
    version: 2,
    historyKey: `2:${order.order.witness.chainid}:${order.hash.toLowerCase()}`,
    type,
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
    srcAmountPerTrade: order.order.witness.input.amount,
    totalTradesAmount,
    isMarketPrice: BN(dstMinAmountPerTrade || 0).lte(1),
    chainId: order.order.witness.chainid,
    filledOrderTimestamp: getFilledOrderTimestamp(fills, totalTradesAmount),
    status: getStatus(order, progress),
    repermitDigest: order.metadata.repermitDigest,
    isTriggerPrice:
      type === OrderType.TAKE_PROFIT_MARKET ||
      type === OrderType.TAKE_PROFIT_LIMIT ||
      type === OrderType.STOP_LOSS_LIMIT ||
      type === OrderType.STOP_LOSS_MARKET,
    rawOrder: order,
    ...getAmounts(order),
  };
};

interface OrdersApiPayload {
  orders: unknown[];
}

const reportInvalidOrders = (
  count: number,
  source: string,
): void => {
  if (count === 0) return;
  console.warn(
    `Skipped ${count} invalid order history ${count === 1 ? "item" : "items"} from ${source}`,
  );
};

const parseOrdersPayload = (
  payload: unknown,
): OrdersApiPayload => {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { orders?: unknown }).orders)
  ) {
    throw new SpotError("INVALID_RESPONSE", "Invalid order history response: missing orders array");
  }

  return {
    orders: (payload as { orders: unknown[] }).orders,
  };
};

/** Fetches one v2 order by its full hash, without loading account history. */
export const getOrder = async ({ orderId, chainId, signal }: {
  orderId: string;
  chainId: number;
  signal?: AbortSignal;
}): Promise<Order | undefined> => {
  if (!orderId.trim()) throw new SpotError("INVALID_ARGUMENT", "An order ID is required");
  // The full order hash already binds the signed exchange. Partner aliases can
  // resolve to legacy adapters and hide new Spot orders (Quick uses "quickswap").
  const query = new URLSearchParams({ hash: orderId, chainId: String(chainId) });
  let response: Response;
  try {
    response = await fetch(`${getApiEndpoint()}/orders?${query}`, { signal, cache: "no-store" });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new SpotError("ORDER_LOOKUP_FAILED", error instanceof Error ? error.message : "Failed to fetch order", { cause: error });
  }
  if (!response.ok) throw new SpotError("ORDER_LOOKUP_FAILED", `Failed to fetch order: ${response.status}`, { status: response.status });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new SpotError("INVALID_RESPONSE", "Invalid order history response: unable to decode JSON", { cause: error, status: response.status });
  }
  signal?.throwIfAborted();
  const { orders } = parseOrdersPayload(payload);
  // The service's hash filter accepts substrings. Require an exact identity
  // match before a response can complete the submitted swap.
  for (const raw of orders) {
    if (!raw || typeof raw !== "object" ||
      typeof (raw as OrderV2).hash !== "string" ||
      (raw as OrderV2).hash.toLowerCase() !== orderId.toLowerCase()) continue;
    try {
      const order = buildV2Order(raw as OrderV2);
      if (order.chainId === chainId) return order;
    } catch (error) {
      throw new SpotError("INVALID_RESPONSE", "Invalid order lookup response", { cause: error, status: response.status });
    }
  }
  return undefined;
};

const fetchOrdersForTarget = async ({
  endpoint,
  chainId,
  signal,
  account,
  partner,
  exchangeAddress,
  page,
  limit,
}: {
  endpoint: string;
  chainId?: number;
  signal?: AbortSignal;
  account?: string;
  partner?: Partners;
  exchangeAddress?: string;
  page?: number;
  limit?: number;
}): Promise<Order[]> => {
  const query = new URLSearchParams();
  if (account !== undefined) query.set("swapper", account);
  if (chainId !== undefined) query.set("chainId", chainId.toString());
  const exchange = [partner === Partners.Quick ? "quickswap" : partner, exchangeAddress]
    .filter(Boolean).join(",");
  if (exchange) query.set("exchange", exchange);
  if (page !== undefined) query.set("page", page.toString());
  if (limit !== undefined) query.set("limit", limit.toString());

  let response: Response;
  try {
    response = await fetch(`${endpoint}/orders${query.size ? `?${query}` : ""}`, { signal });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new SpotError("HISTORY_FAILED", error instanceof Error ? error.message : "Failed to fetch order history", { cause: error });
  }
  if (!response.ok) {
    throw new SpotError("HISTORY_FAILED",
      `Failed to fetch order history from ${endpoint}: ${response.status}`,
      { status: response.status },
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new SpotError("INVALID_RESPONSE", "Invalid order history response: unable to decode JSON", { cause: error, status: response.status });
  }
  signal?.throwIfAborted();
  const payload = parseOrdersPayload(data);
  let invalidOrders = 0;
  const orders = payload.orders.flatMap((rawOrder) => {
    try {
      return [buildV2Order(rawOrder as OrderV2)];
    } catch {
      invalidOrders++;
      return [];
    }
  });
  reportInvalidOrders(invalidOrders, endpoint);

  return orders;
};

const throwAbortError = (): never => {
  const error = new Error("Order history request aborted");
  error.name = "AbortError";
  throw error;
};

export const getOrders = async ({
  chainId,
  signal,
  account,
  partner,
  exchangeAddress,
  page,
  limit,
  getv1orders = true,
}: {
  chainId?: number;
  signal?: AbortSignal;
  account?: string;
  partner?: Partners;
  exchangeAddress?: string;
  page?: number;
  limit?: number;
  getv1orders?: boolean;
}): Promise<Order[]> => {
  const targetResults = await Promise.allSettled(
    getOrderApiEndpoints(getv1orders).map((endpoint) =>
      fetchOrdersForTarget({
        endpoint,
        chainId,
        signal,
        account,
        partner,
        exchangeAddress,
        page,
        limit,
      }),
    ),
  );

  if (signal?.aborted) throwAbortError();

  const successfulTargets = targetResults.filter(
    (result): result is PromiseFulfilledResult<Order[]> =>
      result.status === "fulfilled",
  );
  if (!successfulTargets.length) {
    const firstFailure = targetResults.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    throw firstFailure?.reason instanceof Error
      ? firstFailure.reason
      : new SpotError("HISTORY_FAILED", "Failed to fetch order history", { cause: firstFailure?.reason });
  }

  const ordersByHistoryKey = new Map<string, Order>();
  for (const order of successfulTargets.flatMap((result) => result.value)) {
    if (!ordersByHistoryKey.has(order.historyKey)) {
      ordersByHistoryKey.set(order.historyKey, order);
    }
  }

  return Array.from(ordersByHistoryKey.values());
};

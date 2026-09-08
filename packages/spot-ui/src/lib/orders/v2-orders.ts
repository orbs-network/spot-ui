/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-constant-condition */
import {
  getOrderApiEndpoints,
  getOrderSinkExchanges,
  SPOT_VERSION,
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

const getAmountsSpotV2 = (order: OrderV2): Amounts => {
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

const getAmountsProd = (order: OrderV2): Amounts => {
  const dstMinAmountPerTrade = getDstMinAmountPerTrade(order);

  const isTakeProfit = BN(order.order.witness.output.stop || 0).eq(MAX_UINT_256);

  const totalTradesAmount = order.metadata.expectedChunks || 1;

  return {
    dstMinAmountPerTrade: isTakeProfit ? "" : dstMinAmountPerTrade,
    triggerPricePerTrade: isTakeProfit
      ? dstMinAmountPerTrade
      : BN(order.order.witness.output.stop || 0).toFixed(),
    dstMinAmountTotal:
      isTakeProfit || !dstMinAmountPerTrade
        ? ""
        : BN(dstMinAmountPerTrade).multipliedBy(totalTradesAmount).toFixed(),
  };
};

const getAmounts = (order: OrderV2): Amounts => {
  return Number(SPOT_VERSION) >= 2
    ? getAmountsSpotV2(order)
    : getAmountsProd(order);
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
  totalPages?: number;
}

interface ParsedOrdersPage {
  orders: Order[];
  totalPages: number;
}

interface OrdersRequestTarget {
  exchange?: string;
  endpoints: string[];
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
  requestedPage: number,
): OrdersApiPayload => {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { orders?: unknown }).orders)
  ) {
    throw new Error("Invalid order history response: missing orders array");
  }

  const rawTotalPages = Number(
    (payload as { totalPages?: number | string }).totalPages,
  );
  const totalPages =
    Number.isSafeInteger(rawTotalPages) && rawTotalPages > 0
      ? Math.max(requestedPage, rawTotalPages)
      : requestedPage;

  return {
    orders: (payload as { orders: unknown[] }).orders,
    totalPages,
  };
};

const fetchOrdersPage = async ({
  endpoint,
  chainId,
  signal,
  account,
  exchange,
  page,
  limit,
}: {
  endpoint: string;
  chainId: number;
  signal?: AbortSignal;
  account: string;
  exchange?: string;
  page: number;
  limit?: number;
}): Promise<ParsedOrdersPage> => {
  const query = new URLSearchParams({
    swapper: account,
    chainId: chainId.toString(),
    page: page.toString(),
  });
  if (exchange) query.set("exchange", exchange);
  if (limit !== undefined) query.set("limit", limit.toString());

  const response = await fetch(`${endpoint}/orders?${query}`, { signal });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch order history from ${endpoint}: ${response.status}`,
    );
  }

  const payload = parseOrdersPayload(await response.json(), page);
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

  return { orders, totalPages: payload.totalPages ?? page };
};

const fetchOrdersForTarget = async ({
  endpoint,
  chainId,
  signal,
  account,
  exchange,
  page,
  limit,
}: {
  endpoint: string;
  chainId: number;
  signal?: AbortSignal;
  account: string;
  exchange?: string;
  page?: number;
  limit?: number;
}): Promise<Order[]> => {
  // The public SDK page is zero-based; the order service page is one-based.
  const firstPageNumber = page === undefined ? 1 : page + 1;
  const firstPage = await fetchOrdersPage({
    endpoint,
    chainId,
    signal,
    account,
    exchange,
    page: firstPageNumber,
    limit,
  });

  if (page !== undefined || firstPageNumber >= firstPage.totalPages) {
    return firstPage.orders;
  }

  const remainingPageNumbers = Array.from(
    { length: firstPage.totalPages - firstPageNumber },
    (_, index) => firstPageNumber + index + 1,
  );
  const remainingPages = await Promise.all(
    remainingPageNumbers.map((nextPage) =>
      fetchOrdersPage({
        endpoint,
        chainId,
        signal,
        account,
        exchange,
        page: nextPage,
        limit,
      }),
    ),
  );

  return [
    ...firstPage.orders,
    ...remainingPages.flatMap((result) => result.orders),
  ];
};

const getRequestTargets = (
  endpoints: string[],
  exchange?: string,
  partner?: Partners,
): OrdersRequestTarget[] => {
  const targets = new Map<string, OrdersRequestTarget>();

  for (const endpoint of endpoints) {
    const exchanges = getOrderSinkExchanges({ endpoint, exchange, partner });
    const targetExchanges: Array<string | undefined> = exchanges.length
      ? exchanges
      : [undefined];

    for (const targetExchange of targetExchanges) {
      const key = targetExchange?.toLowerCase() ?? "all";
      const target = targets.get(key) ?? {
        exchange: targetExchange,
        endpoints: [],
      };
      target.endpoints.push(endpoint);
      targets.set(key, target);
    }
  }

  return Array.from(targets.values());
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
  exchange,
  partner,
  page,
  limit,
}: {
  chainId: number;
  signal?: AbortSignal;
  account?: string;
  exchange?: string;
  partner?: Partners;
  page?: number;
  limit?: number;
}): Promise<Order[]> => {
  if (!account) return [];

  const targets = getRequestTargets(
    getOrderApiEndpoints(),
    exchange,
    partner,
  );
  const targetResults = await Promise.allSettled(
    targets.map(async (target) => {
      const results = await Promise.allSettled(
        target.endpoints.map((endpoint) =>
          fetchOrdersForTarget({
            endpoint,
            chainId,
            signal,
            account,
            exchange: target.exchange,
            page,
            limit,
          }),
        ),
      );

      if (signal?.aborted) throwAbortError();

      const successfulResults = results.filter(
        (result): result is PromiseFulfilledResult<Order[]> =>
          result.status === "fulfilled",
      );
      if (!successfulResults.length) {
        const firstFailure = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        throw firstFailure?.reason instanceof Error
          ? firstFailure.reason
          : new Error("Failed to fetch order history");
      }

      return successfulResults.flatMap((result) => result.value);
    }),
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
      : new Error("Failed to fetch order history");
  }

  const ordersByHistoryKey = new Map<string, Order>();
  for (const order of successfulTargets.flatMap((result) => result.value)) {
    if (!ordersByHistoryKey.has(order.historyKey)) {
      ordersByHistoryKey.set(order.historyKey, order);
    }
  }

  return Array.from(ordersByHistoryKey.values());
};

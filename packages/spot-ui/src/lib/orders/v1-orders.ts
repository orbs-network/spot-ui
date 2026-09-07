/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-constant-condition */
import {
  OrderStatus,
  OrderType,
  OrderV1,
  FillV1,
  Order,
  OrderFill,
  GetV1OrdersFilters,
} from "../types";
import BN from "bignumber.js";
import { eqIgnoreCase, getExchanges } from "../utils";
import { THE_GRAPH_ORDERS_API } from "../consts";
type RawStatus = "CANCELLED" | "COMPLETED" | null;

const normalizeSubgraphList = <T>(list?: T[], transform?: (val: T) => string) =>
  list && list.length ? list.map(transform || ((v) => `${v}`)) : undefined;

const getTheGraphUrl = (chainId?: number) => {
  if (!chainId) return;
  return THE_GRAPH_ORDERS_API[chainId as keyof typeof THE_GRAPH_ORDERS_API];
};

type GraphQLPageFetcher = (page: number, limit: number) => string;

const extractGraphList = <T>(response: unknown, field: string): T[] => {
  if (!response || typeof response !== "object") {
    throw new Error("Invalid subgraph response");
  }
  const data = (response as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid subgraph response: missing data");
  }
  const results = (data as Record<string, unknown>)[field];
  if (!Array.isArray(results)) {
    throw new Error(`Invalid subgraph response: missing ${field}`);
  }
  return results as T[];
};

const fetchWithRetryPaginated = async <T>({
  chainId,
  buildQuery,
  extractResults,
  signal,
  retries = 1,
  limit = 1000,
  page: _page,
}: {
  chainId: number;
  buildQuery: GraphQLPageFetcher;
  extractResults: (response: unknown) => T[];
  signal?: AbortSignal;
  retries?: number;
  limit?: number;
  page?: number;
}): Promise<T[]> => {
  const endpoint = getTheGraphUrl(chainId);
  if (!endpoint) throw new NoGraphEndpointError();

  const fetchPage = async (query: string): Promise<T[]> => {
    let attempts = 0;
    while (attempts <= retries) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body: JSON.stringify({ query }),
          signal,
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

        const json: unknown = await res.json();
        const errors =
          json && typeof json === "object"
            ? (json as { errors?: unknown }).errors
            : undefined;
        if (Array.isArray(errors) && errors.length) {
          const firstError = errors[0];
          const message =
            firstError && typeof firstError === "object"
              ? (firstError as { message?: unknown }).message
              : undefined;
          throw new Error(
            typeof message === "string" ? message : "Subgraph request failed",
          );
        }

        return extractResults(json);
      } catch (err) {
        if (
          signal?.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          throw err;
        }
        if (attempts === retries) throw err;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempts));
        attempts++;
      }
    }
    return []; // should never reach here
  };

  let page = 0;
  const results: T[] = [];

  if (_page !== undefined) {
    const query = buildQuery(_page, limit);
    return fetchPage(query);
  }

  while (true) {
    const query = buildQuery(page, limit);
    const pageResults = await fetchPage(query);

    results.push(...pageResults);
    if (pageResults.length < limit) break;

    page++;
  }

  return results;
};

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



const buildV1Order = (
  order: OrderV1,
  chainId: number,
  fills: FillV1[],
  status: OrderStatus
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
    type: getOrderType(order.ask_dstMinAmount, chunks),
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
    status,
    rawOrder: order,
  };
};

const getCreatedOrdersFilters = (filters?: GetV1OrdersFilters) => {
  if (!filters) return "";

  const accounts = normalizeSubgraphList(
    filters.accounts,
    (a) => `"${a.toLowerCase()}"`
  );
  const exchanges = normalizeSubgraphList(
    getExchanges(filters.configs),
    (e) => `"${e.toLowerCase()}"`
  );
  const inTokenSymbols = normalizeSubgraphList(
    filters.inTokenSymbols,
    (s) => `"${s.toUpperCase()}"`
  );
  const outTokenSymbols = normalizeSubgraphList(
    filters.outTokenSymbols,
    (s) => `"${s.toUpperCase()}"`
  );
  const inTokenAddresses = normalizeSubgraphList(
    filters.inTokenAddresses,
    (a) => `"${a.toLowerCase()}"`
  );
  const outTokenAddresses = normalizeSubgraphList(
    filters.outTokenAddresses,
    (a) => `"${a.toLowerCase()}"`
  );
  const transactionHashes = normalizeSubgraphList(
    filters.transactionHashes,
    (h) => `"${h.toLowerCase()}"`
  );
  const orderIds = normalizeSubgraphList(filters.orderIds, (id) => `"${id}"`);
  const twapAddresses = exchanges?.length
    ? ""
    : normalizeSubgraphList(
        filters.configs?.map((c) => c.twapAddress),
        (a) => `"${a.toLowerCase()}"`
      );
  const minDollarValueIn = filters.minDollarValueIn;

  return [
    exchanges ? `exchange_in: [${exchanges.join(", ")}]` : "",
    twapAddresses ? `twapAddress_in: [${twapAddresses.join(", ")}]` : "",
    accounts ? `maker_in: [${accounts.join(", ")}]` : "",
    transactionHashes
      ? `transactionHash_in: [${transactionHashes.join(", ")}]`
      : "",
    orderIds ? `Contract_id_in: [${orderIds.join(", ")}]` : "",
    minDollarValueIn ? `dollarValueIn_gte: ${minDollarValueIn}` : "",
    inTokenSymbols ? `srcTokenSymbol_in: [${inTokenSymbols.join(", ")}]` : "",
    outTokenSymbols ? `dstTokenSymbol_in: [${outTokenSymbols.join(", ")}]` : "",
    inTokenAddresses
      ? `srcTokenAddress_in: [${inTokenAddresses.join(", ")}]`
      : "",
    outTokenAddresses
      ? `dstTokenAddress_in: [${outTokenAddresses.join(", ")}]`
      : "",
    filters?.startDate ? `blockTimestamp_gte: ${filters.startDate}` : "",
    filters?.endDate ? `blockTimestamp_lte: ${filters.endDate}` : "",
    filters?.orderType === "limit" ? `ask_dstMinAmount_gt: 1` : "",
    filters?.orderType === "market" ? `ask_dstMinAmount_lte: 1` : "",
  ]
    .filter(Boolean)
    .join(", ");
};
export async function getCreatedOrders({
  chainId,
  signal,
  page,
  limit: _limit,
  filters,
}: {
  chainId: number;
  signal?: AbortSignal;
  exchanges?: string[];
  page?: number;
  limit?: number;
  filters?: GetV1OrdersFilters;
}): Promise<OrderV1[]> {
  const limit = _limit || 1000;

  const whereClause = getCreatedOrdersFilters(filters);

  const orders = await fetchWithRetryPaginated<OrderV1>({
    chainId,
    signal,
    limit,
    page,
    buildQuery: (page, limit) => `
      {
        orderCreateds(
          ${whereClause ? `where: { ${whereClause} },` : ""}
          first: ${limit},
          skip: ${page * limit},
          orderBy: timestamp,
          orderDirection: desc,
        ) {
          id
          twapAddress
          Contract_id
          ask_bidDelay
          ask_data
          ask_deadline
          ask_dstMinAmount
          ask_dstToken
          ask_fillDelay
          ask_exchange
          ask_srcToken
          ask_srcBidAmount
          ask_srcAmount
          blockNumber
          blockTimestamp
          dex
          dollarValueIn
          dstTokenSymbol
          exchange
          maker
          srcTokenSymbol
          timestamp
          transactionHash
        }
      }
    `,
    extractResults: (json: unknown) =>
      extractGraphList<OrderV1>(json, "orderCreateds"),
  });

  return orders;
}

type GraphStatus = {
  twapId: string;
  twapAddress: string;
  status: RawStatus;
};

export const getStatuses = async ({
  chainId,
  orders,
  signal,
}: {
  chainId: number;
  orders: OrderV1[];
  signal?: AbortSignal;
}): Promise<GraphStatus[]> => {
  if (orders.length === 0) return [];

  const ids = uniq(orders.map((o) => o.Contract_id.toString()));

  if (!ids.length) return [];

  const formattedIds = ids.map((id) => `"${id}"`).join(", ");

  const where = `where: { twapId_in: [${formattedIds}]}`;

  const statuses = await fetchWithRetryPaginated<GraphStatus>({
    chainId,
    signal,
    limit: 1000,
    buildQuery: (page, limit) => `
      {
        statusNews(
          first: ${limit},
          skip: ${page * limit},
          ${where}
        ) {
          twapId
          twapAddress
          status
        }
      }
    `,
    extractResults: (json: unknown) =>
      extractGraphList<GraphStatus>(json, "statusNews"),
  });

  return statuses;
};

export function uniq<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

const getFills = async ({
  chainId,
  orders,
  signal,
}: {
  chainId: number;
  orders: OrderV1[];
  signal?: AbortSignal;
}) => {
  const ids = uniq(orders.map((o) => o.Contract_id)); // no `.toString()`
  const twapAddresses = uniq(orders.map((o) => o.twapAddress)).filter(Boolean);

  if (ids.length === 0) return [];

  const formattedIds = ids.join(", "); // no quotes
  const formattedTwapAddresses = twapAddresses
    .map((addr) => `"${addr}"`)
    .join(", ");
  const twapAddressClause = twapAddresses.length
    ? `twapAddress_in: [${formattedTwapAddresses}]`
    : "";

  const whereFields = [
    `TWAP_id_in: [${formattedIds}]`,
    twapAddressClause,
  ].filter(Boolean);
  const where = `where: { ${whereFields.join(", ")} }`;
  const fills = await fetchWithRetryPaginated<FillV1>({
    chainId,
    signal,
    limit: 1000,
    buildQuery: (page, limit) => `
      {
        orderFilleds(first: ${limit}, orderBy: timestamp, skip: ${
      page * limit
    }, ${where}) {
          id
          dstAmountOut
          dstFee
          srcFilledAmount
          twapAddress
          exchange
          TWAP_id
          srcAmountIn
          timestamp
          transactionHash
          dollarValueIn
          dollarValueOut
        }
      }
    `,
    extractResults: (json: unknown) =>
      extractGraphList<FillV1>(json, "orderFilleds").map((it) => ({
        ...it,
        timestamp: new Date(it.timestamp).getTime(),
      })),
  });

  return fills;
};

export class NoGraphEndpointError extends Error {
  constructor() {
    super("No graph endpoint found");
    this.name = "NoGraphEndpointError";
  }
}

const isUsableV1Order = (order: OrderV1): boolean =>
  (typeof order.Contract_id === "string" ||
    (typeof order.Contract_id === "number" &&
      Number.isFinite(order.Contract_id))) &&
  typeof order.twapAddress === "string" &&
  order.twapAddress.length > 0 &&
  typeof order.exchange === "string";

export const getOrders = async ({
  chainId,
  signal,
  page,
  limit,
  filters,
}: {
  chainId: number;
  signal?: AbortSignal;
  page?: number;
  limit?: number;
  filters?: GetV1OrdersFilters;
}): Promise<Order[]> => {
  try {
    const orders = await getCreatedOrders({
      chainId,
      signal,
      page,
      limit,
      filters,
    });
    let invalidOrders = 0;
    const usableOrders = orders.filter((order) => {
      const usable = isUsableV1Order(order);
      if (!usable) invalidOrders++;
      return usable;
    });
    const [fills, statuses] = await Promise.all([
      getFills({ chainId, orders: usableOrders, signal }),
      getStatuses({ chainId, orders: usableOrders, signal }),
    ]);

    const parsedOrders = usableOrders
      .flatMap((o) => {
        const orderFills = fills?.filter(
          (it) =>
            it.TWAP_id === Number(o.Contract_id) &&
            eqIgnoreCase(it.exchange, o.exchange) &&
            eqIgnoreCase(it.twapAddress, o.twapAddress)
        );
        try {
          return [
            buildV1Order(
              o,
              chainId,
              orderFills,
              getStatus(o, orderFills || [], statuses)
            ),
          ];
        } catch {
          invalidOrders++;
          return [];
        }
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    if (invalidOrders > 0) {
      console.warn(
        `Skipped ${invalidOrders} invalid legacy order history ${invalidOrders === 1 ? "item" : "items"} on chain ${chainId}`,
      );
    }
    const seenIds = new Set<string>();
    return parsedOrders.filter((o) => {
      if (seenIds.has(o.historyKey)) return false;
      seenIds.add(o.historyKey);
      return true;
    });
  } catch (error) {
    if (error instanceof NoGraphEndpointError) return [];
    throw error;
  }
};

const getStatus = (
  order: OrderV1,
  fills: FillV1[],
  statuses?: GraphStatus[]
): OrderStatus => {
  const status = statuses?.find(
    (it) =>
      it.twapId === order.Contract_id.toString() &&
      eqIgnoreCase(it.twapAddress, order.twapAddress)
  )?.status;
  const parsedFills = parseFills(fills);
  const filledSrcAmount = parsedFills.reduce((acc, fill) => acc.plus(fill.inAmount), new BN(0)).toFixed();
  const progress = getV1OrderProgress(order.ask_srcAmount, filledSrcAmount);
  return parseOrderStatus(progress, order.ask_deadline * 1000, status);
};

export const getV1OrderProgress = (
  srcAmount: string,
  filledSrcAmount: string
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
  status?: RawStatus
): OrderStatus => {
  if (progress === 100) return OrderStatus.Completed;
  if (status === "CANCELLED") return OrderStatus.Cancelled;
  if (status === "COMPLETED") return OrderStatus.Completed;

  if (deadline > Date.now()) return OrderStatus.Open;

  return OrderStatus.Expired;
};

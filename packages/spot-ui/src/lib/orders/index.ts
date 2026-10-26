import { Order, Partners } from "../types";
import { SpotError } from "../errors";
import { getTwapConfig } from "./legacy-twap-config";
import { getOrders as getV1Orders } from "./v1-orders";
import { getOrders as getV2Orders } from "./v2-orders";

/** Optional filters for a standalone order-sink history search. */
export interface GetOrdersParams {
  /** Omit to fetch orders across all chains. */
  chainId?: number;
  /** Omit to fetch orders for all swappers. */
  swapper?: string;
  /** Omit to fetch orders across all exchanges. */
  exchange?: Partners;
  /** Zero-based page sent to each order-sink service; omitted uses the service default. */
  page?: number;
  /** Positive page size per service, rather than a limit on the merged result. */
  limit?: number;
  /** Cancels the history requests; it does not cancel any orders. */
  signal?: AbortSignal;
  /** Include orders from order-sink.orbs.network. Defaults to true. */
  getv1orders?: boolean;
}

/**
 * Searches order-sink history without creating a client, newest orders first.
 * By default this merges the current and older order-sink services and removes
 * duplicate history identities. It does not query the legacy TWAP subgraph.
 *
 * @param params Optional account, chain, exchange, and per-service page filters.
 * @returns Normalized orders. A successful service can supply partial results
 * when the other service is unavailable.
 * @throws If pagination is invalid, the request is aborted, or all requested services fail.
 * @example
 * const orders = await getOrders({ chainId: 137, swapper: account, exchange: Partners.Quick });
 */
export const getOrders = async ({
  chainId,
  swapper,
  exchange,
  page,
  limit,
  signal,
  getv1orders,
}: GetOrdersParams = {}): Promise<Order[]> => {
  assertValidPagination(page, limit);
  const orders = await getV2Orders({
    chainId,
    account: swapper,
    partner: exchange,
    page,
    limit,
    signal,
    getv1orders,
  });
  return orders.sort((a, b) => b.createdAt - a.createdAt);
};

/** Account history filters. Client methods provide the chain, partner, and current adapter. */
export interface GetAccountOrdersParams {
  /** Cancels the history requests; it does not cancel any orders. */
  signal?: AbortSignal;
  /** Zero-based legacy history page. V2 always fetches all orders. */
  page?: number;
  /** Positive number of legacy orders requested per page. */
  limit?: number;
  chainId: number;
  partner: Partners;
  /** Current configured adapter, included alongside the partner's legacy adapters. */
  exchangeAddress?: string;
  /** Wallet address that created the orders. */
  account: string;
  /** Include legacy TWAP subgraph history where configured. Defaults to true. */
  legacyOrders?: boolean;
  /** Include orders from order-sink.orbs.network. Defaults to true. */
  getv1orders?: boolean;
}

const assertValidPagination = (page?: number, limit?: number): void => {
  if (page !== undefined && (!Number.isInteger(page) || page < 0)) {
    throw new SpotError("INVALID_ARGUMENT", "Order history page must be a non-negative integer");
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new SpotError("INVALID_ARGUMENT", "Order history limit must be a positive integer");
  }
};

/** Account history plus the availability of its optional legacy TWAP source. */
export interface AccountOrdersResult {
  /** Normalized orders, sorted newest first. Results can be partial if a source fails. */
  orders: Order[];
  /**
   * True only when a configured and requested legacy TWAP source succeeded.
   * False when unavailable, disabled, or failed; this does not describe current-service completeness.
   */
  legacyLoaded: boolean;
}

/**
 * Loads account history from order-sink services and the optional legacy TWAP subgraph.
 * Chain, partner, and current exchange-adapter filters are normally supplied by a client.
 *
 * @returns Newest-first orders and `legacyLoaded`, allowing a host to retry a failed
 * legacy source. Successful sources are retained when another source fails.
 * @throws If pagination is invalid, the request is aborted, or no requested source succeeds.
 */
export const getAccountOrdersResult = async ({
  signal,
  page,
  chainId,
  limit,
  partner,
  exchangeAddress,
  account,
  legacyOrders = true,
  getv1orders = true,
}: GetAccountOrdersParams): Promise<AccountOrdersResult> => {
  
  assertValidPagination(page, limit);
  const twapConfig = getTwapConfig(partner, chainId);
  
  const results = await Promise.allSettled([
    !twapConfig || !legacyOrders
      ? Promise.resolve([])
      : getV1Orders({
          chainId,
          signal,
          page,
          limit,
          filters: {
            accounts: [account],
            configs: [twapConfig],
          },
        }),
    getV2Orders({
      chainId,
      signal,
      account,
      partner,
      exchangeAddress,
      getv1orders,
    }),
  ]);
  if (signal?.aborted) throw signal.reason;

  const [legacyResult, currentResult] = results;
  const hasLegacySource = Boolean(twapConfig && legacyOrders);
  if (
    currentResult.status === "rejected" &&
    (!hasLegacySource || legacyResult.status === "rejected")
  ) {
    throw currentResult.reason;
  }

  const allOrders = results.flatMap((result) => {
    if (result.status === "fulfilled") return result.value;
    console.warn("An order history source is unavailable", result.reason);
    return [];
  });
  const sortedOrders = allOrders.sort((a, b) => b.createdAt - a.createdAt);
  return {
    orders: sortedOrders,
    legacyLoaded: hasLegacySource && legacyResult.status === "fulfilled",
  };
};

/**
 * Loads normalized account history, newest first, with the same filters as
 * `getAccountOrdersResult`. Use that method when the host needs `legacyLoaded`
 * to distinguish unavailable legacy history from a successful empty response.
 * Successful sources can supply partial results when another source fails.
 */
export const getAccountOrders = async (
  params: GetAccountOrdersParams,
): Promise<Order[]> => (await getAccountOrdersResult(params)).orders;

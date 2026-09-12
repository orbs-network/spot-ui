import { Order, Partners } from "../types";
import { getTwapConfig } from "./legacy-twap-config";
import { getOrders as getV1Orders } from "./v1-orders";
import { getOrders as getV2Orders } from "./v2-orders";

export interface GetAccountOrdersParams {
  signal?: AbortSignal;
  /** Zero-based page. Omit it to fetch every available page. */
  page?: number;
  /** Positive number of orders requested per page. */
  limit?: number;
  chainId: number;
  exchange?: string;
  partner: Partners;
  account: string;
  legacyOrders?: boolean;
}

const assertValidPagination = (page?: number, limit?: number): void => {
  if (page !== undefined && (!Number.isInteger(page) || page < 0)) {
    throw new Error("Order history page must be a non-negative integer");
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("Order history limit must be a positive integer");
  }
};

export const getAccountOrders = async ({
  signal,
  page,
  chainId,
  limit,
  exchange,
  partner,
  account,
  legacyOrders = true,
}: GetAccountOrdersParams): Promise<Order[]> => {
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
      exchange,
      partner,
      page,
      limit,
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
  return sortedOrders;
};

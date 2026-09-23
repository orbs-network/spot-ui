import { Order, Partners } from "../types";
import { getTwapConfig } from "./legacy-twap-config";
import { getOrders as getV1Orders } from "./v1-orders";
import { getOrders as getV2Orders } from "./v2-orders";

export interface GetAccountOrdersParams {
  signal?: AbortSignal;
  /** Zero-based legacy history page. V2 always fetches all orders. */
  page?: number;
  /** Positive number of legacy orders requested per page. */
  limit?: number;
  chainId: number;
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

export interface AccountOrdersResult {
  orders: Order[];
  /** True only when the requested legacy source completed successfully. */
  legacyLoaded: boolean;
}

export const getAccountOrdersResult = async ({
  signal,
  page,
  chainId,
  limit,
  partner,
  account,
  legacyOrders = true,
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

export const getAccountOrders = async (
  params: GetAccountOrdersParams,
): Promise<Order[]> => (await getAccountOrdersResult(params)).orders;

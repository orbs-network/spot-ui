import { Order, Partners } from "../types";
import { getTwapConfig } from "../lib";
import { getOrders as getV1Orders } from "./v1-orders";
import { getOrders as getV2Orders } from "./v2-orders";

export const getAccountOrders = async ({
  signal,
  page,
  chainId,
  limit,
  exchange,
  partner,
  account,
  isDev = false,
  legacyOrders = true,
}: {
  signal?: AbortSignal;
  page?: number;
  limit?: number;
  chainId: number;
  exchange?: string;
  partner: Partners;
  account: string;
  isDev?: boolean;
  legacyOrders?: boolean;
}): Promise<Order[]> => {
  const twapConfig = getTwapConfig(partner, chainId);
  const allOrders = await Promise.all([
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
      isDev,
    }),
  ]).then(([graphOrders, apiOrders]) => {
    return [...graphOrders, ...apiOrders];
  });
  const sortedOrders = allOrders.sort((a, b) => b.createdAt - a.createdAt);
  return sortedOrders;
};

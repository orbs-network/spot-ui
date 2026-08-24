import { Config, Order, Partners } from "../types";
import { getOrders as getV1Orders } from "./v1-orders";
import { getOrders as getV2Orders } from "./v2-orders";

export const getAccountOrders = async ({
  signal,
  page,
  chainId,
  limit,
  exchange,
  partner,
  twapConfig,
  account,
  isDev = false,
  includeV1GraphOrders = true,
  includeV2Orders = true,
}: {
  signal?: AbortSignal;
  page?: number;
  limit?: number;
  chainId: number;
  exchange?: string;
  partner: Partners;
  twapConfig?: Config;
  account: string;
  isDev?: boolean;
  includeV1GraphOrders?: boolean;
  includeV2Orders?: boolean;
}): Promise<Order[]> => {
  const allOrders = await Promise.all([
    !twapConfig || !includeV1GraphOrders
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
    includeV2Orders
      ? getV2Orders({
          chainId,
          signal,
          account,
          exchange,
          partner,
          isDev,
        })
      : Promise.resolve([]),
  ]).then(([graphOrders, apiOrders]) => {
    return [...graphOrders, ...apiOrders];
  });
  const sortedOrders = allOrders.sort((a, b) => b.createdAt - a.createdAt);
  return sortedOrders;
};

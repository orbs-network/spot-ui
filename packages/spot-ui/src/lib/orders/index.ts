import { SpotConfig } from "../types";
import { Order } from "../types";
import { getOrders as getV1Orders } from "./v1-orders";
import { getOrders as getV2Orders } from "./v2-orders";

export const getAccountOrders = async ({
  signal,
  page,
  chainId,
  limit,
  config,
  account,
  isDev = false,
  includeV1GraphOrders = true,
}: {
  signal?: AbortSignal;
  page?: number;
  limit?: number;
  chainId: number;
  config?: SpotConfig;
  account: string;
  isDev?: boolean;
  includeV1GraphOrders?: boolean;
}): Promise<Order[]> => {
  const allOrders = await Promise.all([
    !config || !includeV1GraphOrders
      ? Promise.resolve([])
      : getV1Orders({
          chainId,
          signal,
          page,
          limit,
          filters: {
            accounts: [account],
            configs: config.twapConfig ? [config.twapConfig] : [],
          },
        }),
    getV2Orders({
      chainId,
      signal,
      account,
      exchange: config?.adapter,
      partner: config?.partner,
      isDev,
    }),
  ]).then(([graphOrders, apiOrders]) => {
    return [...graphOrders, ...apiOrders];
  });
  const sortedOrders = allOrders.sort((a, b) => b.createdAt - a.createdAt);
  return sortedOrders;
};

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-constant-condition */
import { Partners } from "../../config/partners";
import { Order } from "../../orders/types";
import { getOrderApiEndpoints } from "../../shared/endpoints";
import { buildV2Order } from "./normalize";
import { OrderV2 } from "./types";

interface OrdersApiPayload {
  orders: unknown[];
}

const reportInvalidOrders = (count: number, source: string): void => {
  if (count === 0) return;
  console.warn(
    `Skipped ${count} invalid order history ${count === 1 ? "item" : "items"} from ${source}`,
  );
};

const parseOrdersPayload = (payload: unknown): OrdersApiPayload => {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { orders?: unknown }).orders)
  ) {
    throw new Error("Invalid order history response: missing orders array");
  }

  return {
    orders: (payload as { orders: unknown[] }).orders,
  };
};

const fetchOrdersForTarget = async ({
  endpoint,
  chainId,
  signal,
  account,
  partner,
}: {
  endpoint: string;
  chainId: number;
  signal?: AbortSignal;
  account: string;
  partner: Partners;
}): Promise<Order[]> => {
  const query = new URLSearchParams({
    swapper: account,
    chainId: chainId.toString(),
  });
  query.set("exchange", partner);

  const response = await fetch(`${endpoint}/orders?${query}`, { signal });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch order history from ${endpoint}: ${response.status}`,
    );
  }

  const payload = parseOrdersPayload(await response.json());
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
}: {
  chainId: number;
  signal?: AbortSignal;
  account?: string;
  partner: Partners;
}): Promise<Order[]> => {
  if (!account) return [];

  const targetResults = await Promise.allSettled(
    getOrderApiEndpoints().map((endpoint) =>
      fetchOrdersForTarget({
        endpoint,
        chainId,
        signal,
        account,
        partner,
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
      (result): result is PromiseRejectedResult => result.status === "rejected",
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

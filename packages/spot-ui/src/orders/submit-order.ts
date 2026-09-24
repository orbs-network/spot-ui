import type { SpotAnalytics } from "../analytics/analytics";
import { RePermitOrder } from "../contracts/types";
import { buildV2Order } from "../history/current/normalize";
import { getApiEndpoint } from "../shared/endpoints";
import { Order } from "./types";

export const submitOrder = async (
  order: RePermitOrder,
  signature: `0x${string}`,
  analytics: SpotAnalytics,
): Promise<Order> => {
  try {
    const body = {
      signature,
      order,
      status: "pending",
    };

    analytics.onCreateOrderRequest();

    const response = await fetch(`${getApiEndpoint()}/orders/new`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      const message = data?.message ?? response.statusText ?? "Request failed";
      const code = data?.code ?? response.status;
      throw new Error(`error:${message}, code:${code}`);
    }
    if (!data.signedOrder || typeof data.signedOrder !== "object") {
      throw new Error("Invalid API response: missing signedOrder");
    }
    const newOrder = buildV2Order(data.signedOrder);
    analytics.onCreateOrderSuccess(newOrder.id);
    return newOrder;
  } catch (error) {
    analytics.onCreateOrderError(error);
    console.error(error);
    throw error;
  }
};

import { analytics } from "./analytics";
import { getApiEndpoint } from "./consts";
import { buildV2Order } from "./orders/v2-orders";
import { Order, RePermitOrder, Signature } from "./types";

export const submitOrder = async (order: RePermitOrder, signature: Signature, isDev = false): Promise<Order> => {
  try {
    const body = {
      signature,
      order,
      status: "pending",
    };

    analytics.onCreateOrderRequest();

    console.log(`${getApiEndpoint(isDev)}/orders/new`);
    

    const response = await fetch(`${getApiEndpoint(isDev)}/orders/new`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      const message = data?.message ?? response.statusText ?? "Request failed";
      const code = data?.code ?? response.status;
      throw new Error(`error:${message}, code:${code}`);
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

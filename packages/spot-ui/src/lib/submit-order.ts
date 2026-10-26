import type { SpotAnalytics } from "./analytics";
import { getApiEndpoint } from "./api-config";
import { buildV2Order } from "./orders/v2-orders";
import type { Order, OrderV2, RePermitOrder } from "./types";
import { SpotError } from "./errors";

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

    let response: Response;
    try {
      response = await fetch(`${getApiEndpoint()}/orders/new`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      throw new SpotError("SUBMISSION_FAILED", cause instanceof Error ? cause.message : "Failed to submit order", { cause });
    }
    let data;
    let responseError: unknown;
    try {
      data = await response.json();
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      if (response.ok) {
        throw new SpotError("INVALID_RESPONSE", "Invalid API response: expected JSON", { cause, status: response.status });
      }
      responseError = cause;
      data = {};
    }
    if (!response.ok || data?.success !== true) {
      const message = data?.message ?? response.statusText ?? "Request failed";
      const code = data?.code ?? response.status;
      const failureCode = response.ok && data?.success !== false ? "INVALID_RESPONSE" : "SUBMISSION_FAILED";
      throw new SpotError(failureCode, `error:${message}, code:${code}`, {
        cause: responseError,
        status: response.status,
        serviceCode: typeof data?.code === "string" || typeof data?.code === "number" ? data.code : undefined,
      });
    }
    if (!data.signedOrder || typeof data.signedOrder !== "object") {
      throw new SpotError("INVALID_RESPONSE", "Invalid API response: missing signedOrder", { status: response.status });
    }
    let newOrder: Order;
    try {
      newOrder = buildV2Order(data.signedOrder as OrderV2);
      if (!newOrder.id || typeof newOrder.id !== "string") {
        throw new Error("Missing signed order hash");
      }
    } catch (cause) {
      throw new SpotError("INVALID_RESPONSE", "Invalid API response: invalid signedOrder", { cause, status: response.status });
    }
    analytics.onCreateOrderSuccess(newOrder.id);
    return newOrder;
  } catch (error) {
    analytics.onCreateOrderError(error);
    console.error(error);
    throw error;
  }
};

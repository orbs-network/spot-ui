import type { SpotAnalytics } from "./analytics";
import { getApiEndpoint } from "./api-config";
import { buildV2Order } from "./orders/v2-orders";
import type { Order, OrderV2, RePermitOrder } from "./types";
import { SpotError } from "./errors";
import type { SubmitOrderOptions } from "./client";

const SUBMISSION_TIMEOUT_MILLIS = 30_000;

export const submitOrder = async (
  order: RePermitOrder,
  signature: `0x${string}`,
  analytics: SpotAnalytics,
  options: SubmitOrderOptions = {},
): Promise<Order> => {
  // A preflight abort establishes that this call never sent the signed order.
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(new SpotError("SUBMISSION_FAILED",
    "Submission tracking stopped. Check order status before submitting another order.",
    { cause: options.signal?.reason },
  ));
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new SpotError("SUBMISSION_FAILED",
    "Order submission timed out. Check order status before submitting another order.",
    { cause: new Error("Submission exceeded 30 seconds") },
  )), SUBMISSION_TIMEOUT_MILLIS);
  let rejectAborted!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAborted = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectAborted, { once: true });
  });
  const send = async (): Promise<Order> => {
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
        signal: controller.signal,
      });
    } catch (cause) {
      controller.signal.throwIfAborted();
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      throw new SpotError("SUBMISSION_FAILED", cause instanceof Error ? cause.message : "Failed to submit order", { cause });
    }
    let data;
    let responseError: unknown;
    try {
      data = await response.json();
    } catch (cause) {
      controller.signal.throwIfAborted();
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      if (response.ok) {
        throw new SpotError("INVALID_RESPONSE", "Invalid API response: expected JSON", { cause, status: response.status });
      }
      responseError = cause;
      data = {};
    }
    controller.signal.throwIfAborted();
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
  };
  try {
    return await Promise.race([send(), aborted]);
  } catch (error) {
    analytics.onCreateOrderError(error);
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
    controller.signal.removeEventListener("abort", rejectAborted);
  }
};

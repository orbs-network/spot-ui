/** @internal Shared implementation hooks for spot-react; applications should use the public client API. */
export {
  createAnalytics, setUIVersion, bindOrderAnalytics, bindSubmittedOrderAnalytics,
  getOrderAnalytics, getSubmittedOrderAnalytics, resolveAnalyticsReporter,
  type AnalyticsContext, type SpotAnalytics,
} from "./lib/analytics";
export { isNativeAddress, eqIgnoreCase } from "./lib/utils";
export { getTwapConfig } from "./lib/orders/legacy-twap-config";
export { toAmountRaw, toAmountUI } from "./lib/order-form/amounts";
export { captureValidatedOrderForm } from "./lib/order-form/capture-order-form";
export { captureValidatedSwap, type ReviewedSwapInput } from "./lib/swap-validation";
export {
  getClientAnalytics,
} from "./lib/internal/client";

import { createClient, type CreateClientOptions, type SpotClient } from "./lib/client";
import { bindClientCreationAnalytics } from "./lib/internal/client";
import type { SpotAnalytics } from "./lib/analytics";
import type { Partners } from "./lib/types";

export function createClientWithAnalytics(
  partner: Partners, chainId: number, options: CreateClientOptions = {}, analytics?: SpotAnalytics,
): Promise<SpotClient> {
  const internalOptions = { ...options };
  if (analytics) bindClientCreationAnalytics(internalOptions, analytics);
  return createClient(partner, chainId, internalOptions);
}

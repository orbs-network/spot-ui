/** @internal Shared implementation hooks for spot-react; applications should use the public client API. */
export { createAnalytics, setUIVersion, type AnalyticsContext, type SpotAnalytics } from "./lib/analytics";
export { isNativeAddress, eqIgnoreCase, isTxRejected } from "./lib/utils";
export { getTwapConfig } from "./lib/orders/legacy-twap-config";
export { toAmountRaw, toAmountUI } from "./lib/order-form/amounts";
export {
  executeClientOrder, resumeClientOrder, prepareClientSwap, getClientAnalytics,
  type InternalExecuteOrderParams, type InternalResumeOrderControls,
} from "./lib/internal/client";
export type { OrderExecutionUpdate, OrderExecutionPhase, OrderExecutionStep, SignableOrder } from "./lib/internal/execute-order";

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

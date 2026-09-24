import type { ClientGetAccountOrdersParams, SpotClient } from "./types";
import { Analytics, type AnalyticsOptions } from "../analytics/analytics";
import { fetchRePermitData } from "../config/fetch-config";
import type { Partners } from "../config/partners";
import type { RePermitOrder } from "../contracts/types";
import {
  getAccountOrders,
  getAccountOrdersResult,
  type AccountOrdersResult,
} from "../history/get-account-orders";
import { buildCancelOrderRequest } from "../orders/cancel-order";
import { createOrderPreparer } from "../orders/create-preparer";
import { submitOrder as submitOrderRequest } from "../orders/submit-order";
import type { Order } from "../orders/types";
/** Creates a client after validating config; caching and refresh remain host-owned. */
export const createClient = async (
  partner: Partners,
  chainId: number,
  options: AnalyticsOptions = {},
): Promise<SpotClient> => {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("chainId must be a positive safe integer");
  }

  // Fetch the chain-specific RePermit configuration once for this client.
  const rePermitData = await fetchRePermitData(partner, chainId);
  const analytics = new Analytics(options);
  analytics.init(partner, rePermitData);
  const spenderAddress = rePermitData.domain.verifyingContract;
  const exchangeAddress = rePermitData.order.witness.exchange.adapter;
  const prepareOrder = createOrderPreparer(rePermitData);

  /**
   * Sends a prepared order and its wallet signature to the order service. The
   * order must already have been signed by the host wallet.
   */
  const submitOrder = (
    order: RePermitOrder,
    signature: `0x${string}`,
  ): Promise<Order> => submitOrderRequest(order, signature, analytics);

  /**
   * Fetches order history with the partner and chain captured by
   * this client, leaving only account and pagination options to the caller.
   */
  const getConfiguredAccountOrdersResult = (
    params: ClientGetAccountOrdersParams,
  ): Promise<AccountOrdersResult> =>
    getAccountOrdersResult({
      ...params,
      chainId,
      partner,
    });

  return Object.freeze({
    analytics,
    partner,
    chainId,
    rePermitData,
    spenderAddress,
    exchangeAddress,
    prepareOrder,
    submitOrder,
    getCancelOrderRequest: (order: Order) =>
      buildCancelOrderRequest(order, spenderAddress),
    getAccountOrdersResult: getConfiguredAccountOrdersResult,
    getAccountOrders: (
      params: ClientGetAccountOrdersParams,
    ): Promise<Order[]> => getAccountOrders({ ...params, chainId, partner }),
  });
};

import {
  type PrepareOrderParams,
  type PrepareSwapParams,
  type PreparedOrder,
  type PreparedSwap,
  type SpotClient,
  type CalculatedOrderForm,
} from "@orbs-network/spot-ui";
import {
  captureValidatedOrderForm,
  bindSubmittedOrderAnalytics,
  captureValidatedSwap,
  type SpotAnalytics,
} from "@orbs-network/spot-ui/internal";
import { createOperationAnalytics } from "../analytics";
import { createOrderExecutionSession } from "./session";
import { observe } from "./observe";
import { waitForOrder } from "./wait-for-order";
import type { OrderExecutionUpdate, OrderWalletInteractions, SignableOrder } from "./progress";
import type { OrderExecution, SwapExecution } from "./types";

/** React/demo-owned wallet orchestration inputs; the core client stays wallet-independent. */
export interface CreateOrderExecutionParams extends PrepareOrderParams {
  walletInteractions: OrderWalletInteractions;
  signal?: AbortSignal;
}

export interface CreateSwapExecutionParams extends PrepareSwapParams {
  walletInteractions: OrderWalletInteractions;
}

const retainProgressSnapshot = <T extends SignableOrder>(
  reporter: SpotAnalytics,
  original: OrderExecutionUpdate<T>,
  snapshot: OrderExecutionUpdate<T>,
): void => {
  if (original.order && snapshot.order) bindSubmittedOrderAnalytics(snapshot.order, reporter);
};

const invalidReview = (analytics: SpotAnalytics, error: unknown): never => {
  observe(() => analytics.onExecutionRequest());
  observe(() => analytics.onExecutionError(error, "preparing"));
  throw error;
};

/** Internal React/demo runner. All protocol preparation and submission use the public client API. */
export const createHostOrderExecution = (
  client: SpotClient,
  params: CreateOrderExecutionParams,
): OrderExecution => {
  const reporter = createOperationAnalytics({
    account: params.account, chainId: client.chainId, partner: client.partner, orderType: params.form?.orderType,
    inputTokenAddress: params.inputTokenAddress, outputTokenAddress: params.outputTokenAddress,
    inputAmountRaw: params.form?.inputAmount?.raw,
  }, client);
  let form: CalculatedOrderForm;
  try { form = captureValidatedOrderForm(params); }
  catch (error) { return invalidReview(reporter, error); }
  const { account, inputTokenAddress, outputTokenAddress, walletInteractions, signal } = params;
  return createOrderExecutionSession<PreparedOrder>({
    account, inputTokenAddress, inputAmountRaw: form.inputAmount.raw, walletInteractions, signal,
    prepareOrder: () => client.prepareOrder({ form, account, inputTokenAddress, outputTokenAddress }),
  }, {
    client, analytics: reporter, waitForCompletionOnRun: false,
    onProgressSnapshot: (original, snapshot) => retainProgressSnapshot(reporter, original, snapshot),
    submitOrder: (order, signature, options) => client.submitOrder(order, signature, options),
    settleOrder: (order, onProgress, signal) => waitForOrder({ client, order, onProgress, signal, analytics: reporter }),
  });
};

/** Internal swap UI runner; the DEX owns wallet sequencing and status polling. */
export const createHostSwapExecution = (
  client: SpotClient,
  params: CreateSwapExecutionParams,
): SwapExecution => {
  const reporter = createOperationAnalytics({
    account: params.account, chainId: client.chainId, partner: client.partner, orderType: "SWAP",
    inputTokenAddress: params.quote?.request?.inToken, outputTokenAddress: params.quote?.request?.outToken,
    inputAmountRaw: params.quote?.request?.inAmount,
  }, client);
  let reviewed: ReturnType<typeof captureValidatedSwap>;
  try { reviewed = captureValidatedSwap(params.quote, params.account, client.chainId, client.partner); }
  catch (error) { return invalidReview(reporter, error); }
  const { account, walletInteractions, signal } = params;
  return createOrderExecutionSession<PreparedSwap>({
    account, inputTokenAddress: reviewed.quote.request.inToken, inputAmountRaw: reviewed.quote.request.inAmount,
    walletInteractions, signal,
    prepareOrder: signal => client.prepareSwap({ quote: reviewed.quote, account, signal }),
  }, {
    client, analytics: reporter, waitForCompletionOnRun: true,
    onProgressSnapshot: (original, snapshot) => retainProgressSnapshot(reporter, original, snapshot),
    submitOrder: (order, signature, options) => client.submitSwap(order, signature, options),
    settleOrder: (order, onProgress, signal) => waitForOrder({ client, order, onProgress, signal, analytics: reporter }),
  });
};

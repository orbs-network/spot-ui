import type { SpotClient } from "@orbs-network/spot-ui";
import { createAnalytics, getClientAnalytics, type AnalyticsContext, type SpotAnalytics } from "@orbs-network/spot-ui/internal";
import type { SwapExecution } from "./types";

type ExecutionAnalyticsInputs = Pick<SwapExecution,
  "account" | "chainId" | "partner" | "form" | "inputToken" | "outputToken" | "orderId"
>;

/** Capture review metadata before preparation or recovery can fail. */
export const getExecutionAnalyticsContext = ({
  account, chainId, partner, form, inputToken, outputToken, orderId,
}: ExecutionAnalyticsInputs): AnalyticsContext => {
  const values = form?.values;
  return {
    account,
    chainId,
    partner,
    orderId,
    module: form?.module,
    inputTokenAddress: inputToken?.address,
    inputTokenSymbol: inputToken?.symbol,
    outputTokenAddress: outputToken?.address,
    outputTokenSymbol: outputToken?.symbol,
    inputAmountRaw: form?.inputAmount?.raw,
    minimumOutputAmountRaw: values?.minOutputAmountPerTrade,
    inputAmountPerTradeRaw: values?.inputAmountPerTrade,
    triggerOutputAmountPerTradeRaw: values?.triggerOutputAmountPerTrade,
    totalTrades: values?.totalTrades,
    fillDelayMillis: values?.fillDelayMillis,
    slippagePercent: values ? values.slippageBps / 100 : undefined,
    isMarketOrder: values?.isMarketOrder,
  };
};

/** Each attempt owns its metadata and delivery lifetime, including before client initialization. */
export const createOperationAnalytics = (
  context: AnalyticsContext,
  client?: SpotClient,
  disableAnalytics = false,
): SpotAnalytics => {
  try {
    return client && !disableAnalytics
      ? getClientAnalytics(client).createOperation(context)
      : createAnalytics(context, { disableAnalytics });
  } catch {
    // A custom reporter must not prevent the wallet or its original error from being reached.
    return createAnalytics(context, { disableAnalytics: true });
  }
};

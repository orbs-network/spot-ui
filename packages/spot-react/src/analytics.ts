import type { SpotClient } from "@orbs-network/spot-ui";
import { createAnalytics, getClientAnalytics, type AnalyticsContext, type SpotAnalytics } from "@orbs-network/spot-ui/internal";
import type { OrderExecutionState } from "./types";

type ExecutionAnalyticsInputs = Pick<OrderExecutionState,
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
    orderType: form?.orderType,
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

/** Attempt metadata inherits the owning client policy; unowned fallback reporting stays silent. */
export const createOperationAnalytics = (
  context: AnalyticsContext,
  client?: SpotClient,
): SpotAnalytics => {
  try {
    return client
      ? getClientAnalytics(client).createOperation(context)
      : createAnalytics(context, { disableAnalytics: true });
  } catch {
    // A custom reporter must not prevent the wallet or its original error from being reached.
    return createAnalytics(context, { disableAnalytics: true });
  }
};

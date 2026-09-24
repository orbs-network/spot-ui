import { buildRePermitOrderData } from "../orders/prepare-order";
import { isNativeAddress } from "../shared/addresses";
import type { TimeDuration } from "../shared/time";
import type { Address } from "../shared/types";

import type {
  PrepareOrderParams,
  PreparedOrder,
  PreparedOrderValues,
} from "../client/types";
import type { RePermitData } from "../config/types";
const getDeadline = (
  currentTimeMillis: number,
  duration: TimeDuration,
): number => currentTimeMillis + duration.unit * duration.value + 60_000;

export const createOrderPreparer = (rePermitData: RePermitData) => {
  const spenderAddress = rePermitData.domain.verifyingContract;
  let latestNonce = 0;

  // Keep nonces monotonic for this client instance. A newly created client
  // starts again from the current wall-clock value.
  const createNonce = (currentTimeMillis: number): string => {
    latestNonce = Math.max(currentTimeMillis, latestNonce + 1);
    return latestNonce.toString();
  };

  /**
   * Stamps an existing calculated form with a fresh start, deadline, and nonce,
   * then creates the exact protocol order, wallet signing payload, and ERC-20
   * approval request. It performs no wallet interaction or network submission.
   */
  const prepareOrder = (params: PrepareOrderParams): PreparedOrder => {
    const { form } = params;
    if (!form.canSubmit) {
      throw new Error("Order form is not submittable");
    }
    if (isNativeAddress(params.inputTokenAddress)) {
      throw new Error(
        "prepareOrder inputTokenAddress must be an ERC-20 address; pass the host-provided wrapped native token for native input",
      );
    }
    const values = form.values;
    const currentTimeMillis = Date.now();
    const preparedValues: PreparedOrderValues = {
      ...values,
      currentTimeMillis,
      deadlineMillis: getDeadline(currentTimeMillis, values.duration),
    };
    const permitData = buildRePermitOrderData({
      inputTokenAddress: params.inputTokenAddress,
      outputTokenAddress: params.outputTokenAddress,
      totalInputAmount: values.inputAmount,
      nonce: createNonce(currentTimeMillis),
      currentTimeMillis: preparedValues.currentTimeMillis,
      deadlineMillis: preparedValues.deadlineMillis,
      fillDelayMillis: values.fillDelayMillis,
      totalTrades: values.totalTrades,
      slippageBps: values.slippageBps,
      swapperAddress: params.swapperAddress,
      inputAmountPerTrade: values.inputAmountPerTrade,
      minOutputAmountPerTrade: values.minOutputAmountPerTrade,
      triggerOutputAmountPerTrade: values.triggerOutputAmountPerTrade,
      permitData: rePermitData,
      module: form.module,
    });
    const order = permitData.order;

    return {
      order,
      signingRequest: {
        signerAddress: params.swapperAddress as Address,
        typedData: {
          domain: permitData.domain,
          types: permitData.types,
          primaryType: permitData.primaryType,
          message: order,
        },
      },
      approvalRequest: {
        tokenAddress: order.permitted.token,
        amount: values.inputAmount,
        spenderAddress,
      },
      form,
      values: preparedValues,
    };
  };

  return prepareOrder;
};

import type { PrepareOrderParams } from "../client";
import { SpotError } from "../errors";
import { OrderType } from "../types";
import { isNativeAddress } from "../utils";
import type { CalculatedOrderForm } from "./types";
import { assertOrderExecutionValues } from "./validation";

/** Capture validated review inputs without creating signing timestamps or opening a wallet. */
export const captureValidatedOrderForm = (params: PrepareOrderParams): CalculatedOrderForm => {
  if (!Object.values(OrderType).includes(params.form?.orderType)) {
    throw new SpotError("INVALID_ARGUMENT", "Advanced orders require an OrderType; use prepareSwap for quote-based swaps");
  }
  if (!params.form.canSubmit) throw new SpotError("FORM_NOT_SUBMITTABLE", "Order form is not submittable");
  const form = structuredClone(params.form);
  for (const address of [params.account, params.inputTokenAddress, params.outputTokenAddress]) {
    if (typeof address !== "string" || !/^0x[0-9a-f]{40}$/i.test(address)) {
      throw new SpotError("INVALID_ARGUMENT", "Invalid order token or signer address");
    }
  }
  if (isNativeAddress(params.account) || isNativeAddress(params.inputTokenAddress)) {
    throw new SpotError("INVALID_ARGUMENT", "Use a wrapped ERC-20 input token and a nonzero signing account");
  }
  if (typeof form.inputAmount.raw !== "string" || !/^\d+$/.test(form.inputAmount.raw) ||
    BigInt(form.inputAmount.raw) <= BigInt(0)) {
    throw new SpotError("INVALID_AMOUNT", "Input amount must be a positive integer base-unit amount");
  }
  if (form.values.inputAmount !== form.inputAmount.raw) {
    throw new SpotError("PREPARED_ORDER_MISMATCH", "Form values do not match the reviewed input amount");
  }
  assertOrderExecutionValues(form.orderType, form.values);
  return form;
};

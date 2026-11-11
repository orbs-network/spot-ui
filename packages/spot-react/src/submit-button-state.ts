import {
  type CalculatedOrderForm,
  type OrderFormNotReadyReason,
} from "@orbs-network/spot-ui";
import { isNativeAddress } from "@orbs-network/spot-ui/internal";
import type { SpotTradingState } from "./context/spot-trading-context";
import { isExecutionActive, isExecutionLocked } from "./execution-state";
import { ExecutionPhase } from "./types";

/** Stable codes for the prerequisite or validation currently disabling submission. */
export type SubmitDisabledReason =
  | OrderFormNotReadyReason
  | "execution-in-progress"
  | "unconfirmed-order"
  | "order-completed"
  | "missing-chain"
  | "client-loading"
  | "client-error"
  | "client-unavailable"
  | "missing-wrapped-native-token"
  | "balance-loading"
  | "quote-loading"
  | "no-liquidity"
  | "validation-error"
  | "form-not-ready"
  | "form-not-submittable";

export type SubmitButtonResult =
  | { disabled: false; loading: boolean; disabledReason?: undefined }
  | { disabled: true; loading: boolean; disabledReason: SubmitDisabledReason };

interface SubmitButtonInputs extends Pick<
  SpotTradingState,
  | "inputToken"
  | "outputToken"
  | "wrappedNativeToken"
  | "inputBalanceRaw"
  | "noLiquidity"
  | "inputAmountUi"
  | "marketPriceLoading"
  | "hasChainId"
> {
  form: Pick<CalculatedOrderForm, "isReady" | "canSubmit" | "errors" | "notReadyReason">;
  hasClient: boolean;
  clientError?: unknown;
  isClientLoading: boolean;
  executionPhase: ExecutionPhase;
}

interface SubmitButtonConditions {
  isExecuting: boolean;
  isWrappedNativeTokenMissing: boolean;
  loading: boolean;
}

const getDisabledReason = (
  input: SubmitButtonInputs,
  conditions: SubmitButtonConditions,
): SubmitDisabledReason => {
  const { form } = input;
  // Report the first prerequisite the host can act on. Validation errors remain
  // separate from missing data, and an uncertain order always takes precedence.
  if (conditions.isExecuting) return "execution-in-progress";
  if (input.executionPhase === ExecutionPhase.UNCONFIRMED) return "unconfirmed-order";
  if (!input.hasChainId) return "missing-chain";
  if (!input.inputToken || !input.outputToken) return "missing-token-metadata";
  if (conditions.isWrappedNativeTokenMissing) return "missing-wrapped-native-token";
  if (!input.hasClient && input.clientError) return "client-error";
  if (!input.hasClient && input.isClientLoading) return "client-loading";
  if (!input.hasClient) return "client-unavailable";
  if (form.notReadyReason === "empty-input") return "empty-input";
  if (input.noLiquidity) return "no-liquidity";
  if (input.marketPriceLoading && conditions.loading) return "quote-loading";
  if (!form.isReady && form.notReadyReason) return form.notReadyReason;
  if (form.errors.primary) return "validation-error";
  if (input.inputBalanceRaw === undefined && conditions.loading) return "balance-loading";
  if (!form.isReady) return "form-not-ready";
  return "form-not-submittable";
};

/** Pure derivation shared by the hook's disabled/loading state and diagnostics. */
export const getSubmitButtonState = (input: SubmitButtonInputs): SubmitButtonResult => {
  if (input.executionPhase === ExecutionPhase.SUCCESS) {
    return { disabled: true, loading: false, disabledReason: "order-completed" };
  }
  const { form, inputToken, outputToken, wrappedNativeToken } = input;
  const isExecuting = isExecutionActive(input.executionPhase);
  const isWrappedNativeTokenMissing = Boolean(
    inputToken &&
      isNativeAddress(inputToken.address) &&
      (!wrappedNativeToken || isNativeAddress(wrappedNativeToken.address)),
  );
  const isPropsLoading =
    input.marketPriceLoading ||
    (!form.isReady && !form.errors.primary) ||
    input.inputBalanceRaw === undefined;
  const loading =
    isExecuting ||
    (input.hasChainId && input.isClientLoading && !input.hasClient) ||
    Boolean(inputToken && outputToken && input.inputAmountUi && isPropsLoading);
  const disabled = Boolean(
    !form.canSubmit ||
      isExecutionLocked(input.executionPhase) ||
      !input.hasChainId ||
      !input.hasClient ||
      input.noLiquidity ||
      loading ||
      !inputToken ||
      !outputToken ||
      isWrappedNativeTokenMissing,
  );
  if (!disabled) return { disabled: false, loading };
  return {
    disabled: true,
    loading,
    disabledReason: getDisabledReason(input, { isExecuting, isWrappedNativeTokenMissing, loading }),
  };
};

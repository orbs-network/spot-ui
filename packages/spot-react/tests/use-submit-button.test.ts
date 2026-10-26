import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateOrder,
  InputErrors,
  Module,
  type CalculatedOrderForm,
} from "../../spot-ui/src";
import { useSubmitButton } from "../src/hooks/use-execution";
import { useInputErrors } from "../src/hooks/use-input-errors";
import { ExecutionPhase } from "../src/types";

const state = vi.hoisted(() => ({
  form: undefined as CalculatedOrderForm | undefined,
  trading: {
    inputToken: { address: "0x1111111111111111111111111111111111111111", symbol: "IN", decimals: 6 },
    outputToken: { address: "0x2222222222222222222222222222222222222222", symbol: "OUT", decimals: 18 },
    inputAmountUi: "1",
    inputBalanceRaw: "2000000" as string | undefined,
    marketPriceLoading: false,
    hasChainId: true,
    noLiquidity: false,
  },
  client: { data: {} as object | undefined, isLoading: false },
  phase: "idle",
}));

// These hooks derive their result entirely from the current provider snapshot.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("../src/hooks/use-submit-order", () => ({ useSubmitOrder: () => vi.fn() }));
vi.mock("../src/hooks/use-swap-execution", () => ({ useSwapExecution: () => ({}) }));
vi.mock("../src/context/order-form-context", () => ({ useOrderForm: () => state.form }));
vi.mock("../src/context/spot-trading-context", () => ({ useSpotTrading: () => state.trading }));
vi.mock("../src/context/use-client", () => ({ useClient: () => state.client }));
vi.mock("../src/context/spot-store-context", () => ({
  useSpotStore: (selector: (store: { state: { currentExecution: { phase: string } } }) => unknown) =>
    selector({ state: { currentExecution: { phase: state.phase } } }),
}));

const swapParams = {
  module: Module.SWAP,
  inputTokenDecimals: 6,
  outputTokenDecimals: 18,
  quotedOutputAmountRaw: "2000000000000000000",
  inputTokenUsdPrice: "10",
  minTradeSizeUsd: 1,
  priceProtectionPercent: 3,
  userInput: { inputAmountUi: "1", isMarketOrder: false },
};

beforeEach(() => {
  state.form = calculateOrder(swapParams);
  state.trading.inputAmountUi = "1";
  state.trading.inputBalanceRaw = "2000000";
  state.trading.marketPriceLoading = false;
  state.client.data = {};
  state.client.isLoading = false;
  state.phase = ExecutionPhase.IDLE;
});

describe("swap submit button validation", () => {
  it.each([undefined, "0", "-1", "2000000000000000001"])(
    "shows an invalid minimum error without an endless spinner for %s",
    (minimumOutputAmountRaw) => {
      state.form = calculateOrder({ ...swapParams, minimumOutputAmountRaw });
      expect(state.form.isReady).toBe(false);
      expect(useInputErrors()?.type).toBe(InputErrors.INVALID_SWAP_MINIMUM);
      expect(useSubmitButton()).toEqual({ disabled: true, loading: false });
    },
  );

  it.each(["quote", "USD price"])("keeps loading while the %s is unavailable", (missing) => {
    state.form = calculateOrder({
      ...swapParams,
      quotedOutputAmountRaw: missing === "quote" ? undefined : swapParams.quotedOutputAmountRaw,
      inputTokenUsdPrice: missing === "USD price" ? undefined : swapParams.inputTokenUsdPrice,
    });
    expect(useInputErrors()).toBeUndefined();
    expect(useSubmitButton()).toEqual({ disabled: true, loading: true });
  });

  it("shows neither a validation error nor a spinner for an empty amount", () => {
    state.trading.inputAmountUi = "";
    state.form = calculateOrder({ ...swapParams, userInput: { ...swapParams.userInput, inputAmountUi: "" } });
    expect(useInputErrors()).toBeUndefined();
    expect(useSubmitButton()).toEqual({ disabled: true, loading: false });
  });

  it.each(["market", "balance", "client", "execution"])(
    "preserves actual %s loading even when the form has a validation error",
    (loading) => {
      if (loading === "market") state.trading.marketPriceLoading = true;
      if (loading === "balance") state.trading.inputBalanceRaw = undefined;
      if (loading === "client") {
        state.client.data = undefined;
        state.client.isLoading = true;
      }
      if (loading === "execution") state.phase = ExecutionPhase.SIGNING;
      expect(useSubmitButton()).toEqual({ disabled: true, loading: true });
    },
  );

  it("enables submission after a valid minimum arrives", () => {
    state.form = calculateOrder({ ...swapParams, minimumOutputAmountRaw: "1900000000000000000" });
    expect(useInputErrors()).toBeUndefined();
    expect(useSubmitButton()).toEqual({ disabled: false, loading: false });
  });
});

import { describe, expect, it } from "vitest";
import {
  InputErrors,
  Module,
  OrderType,
  TimeUnit,
  calculateOrder,
  getOrderFillDelayMillis,
  invertPriceInput,
  type Order,
} from "../src";

const baseParams = {
  module: Module.TWAP,
  inputTokenDecimals: 6,
  outputTokenDecimals: 18,
  quotedOutputAmountRaw: "2000000000000000000",
  inputTokenUsdPrice: "10",
  outputTokenUsdPrice: "5",
  minTradeSizeUsd: 1,
  priceProtectionPercent: 3,
  displayFeePercent: 0.25,
  userInput: {
    inputAmountUi: "1",
    isMarketOrder: true,
    tradeCount: 2,
  },
};

describe("calculateOrder", () => {
  it("ignores price inversion for swap display and preserves its signed minimum", () => {
    const params = {
      ...baseParams,
      module: Module.SWAP,
      minimumOutputAmountRaw: "1900000000000000000",
    };
    const regular = calculateOrder(params);
    const inverted = calculateOrder({
      ...params,
      userInput: { ...params.userInput, isPriceInverted: true },
    });
    expect(inverted.isInverted).toBe(false);
    expect(inverted.limitPrice.display).toEqual(regular.limitPrice.display);
    expect(inverted.values.minOutputAmountTotal).toBe("1900000000000000000");
  });

  it.each(["", "0"])("keeps swap prices finite with input %j and a previous quote", (inputAmountUi) => {
    const form = calculateOrder({
      ...baseParams,
      module: Module.SWAP,
      minimumOutputAmountRaw: "1900000000000000000",
      userInput: { ...baseParams.userInput, inputAmountUi },
    });
    expect(form.canSubmit).toBe(false);
    expect(form.limitPrice.display.ui).toBe("");
    expect(form.limitPrice.raw).not.toMatch(/Infinity|NaN/);
  });

  it("creates a single limit order from exact swap quote amounts", () => {
    const form = calculateOrder({
      ...baseParams,
      module: Module.SWAP,
      quotedOutputAmountRaw: "270311015092003391",
      minimumOutputAmountRaw: "268959460016543374",
      userInput: {
        ...baseParams.userInput,
        limitPriceUi: "9999",
        tradeCount: 25,
        orderDuration: { unit: TimeUnit.Days, value: 7 },
      },
    });
    expect(form.canSubmit).toBe(true);
    expect(form.values).toMatchObject({
      orderType: OrderType.LIMIT,
      slippageBps: 500,
      isMarketOrder: false,
      totalTrades: 1,
      inputAmountPerTrade: "1000000",
      outputAmount: "270311015092003391",
      minOutputAmountPerTrade: "268959460016543374",
      minOutputAmountTotal: "268959460016543374",
      triggerOutputAmountPerTrade: "0",
    });
    expect(form.schedule.durationMillis).toBe(900_000);
    expect(form.values.duration).toEqual({ unit: TimeUnit.Minutes, value: 15 });
    expect(form.fees.raw).toBe("675777537730008");
  });

  it("preserves quote precision even when per-token output prices round to zero", () => {
    const form = calculateOrder({
      ...baseParams,
      module: Module.SWAP,
      inputTokenDecimals: 0,
      outputTokenDecimals: 0,
      quotedOutputAmountRaw: "6",
      minimumOutputAmountRaw: "5",
      userInput: { ...baseParams.userInput, inputAmountUi: "1000" },
    });
    expect(form.canSubmit).toBe(true);
    expect(form.outputAmount.raw).toBe("6");
    expect(form.values.minOutputAmountPerTrade).toBe("5");
  });

  it.each([undefined, "", "0", "-1", "1.5", "NaN", "Infinity", "1e2", "2000000000000000001"])(
    "blocks swaps with invalid minimum output %s", (minimumOutputAmountRaw) => {
      const form = calculateOrder({ ...baseParams, module: Module.SWAP, minimumOutputAmountRaw });
      expect(form.isReady).toBe(false);
      expect(form.canSubmit).toBe(false);
      expect(form.errors.swapMinimum).toEqual({
        type: InputErrors.INVALID_SWAP_MINIMUM,
        value: minimumOutputAmountRaw ?? "",
      });
      expect(form.errors.primary).toBe(form.errors.swapMinimum);
      expect(form.errors.all).toContain(form.errors.swapMinimum);
    },
  );

  it.each([
    { userInput: { ...baseParams.userInput, inputAmountUi: "" } },
    { userInput: { ...baseParams.userInput, inputAmountUi: "0" } },
    { quotedOutputAmountRaw: undefined },
    { quotedOutputAmountRaw: "0" },
    { inputTokenUsdPrice: undefined },
    { inputTokenUsdPrice: "0" },
  ])("waits for basic form inputs before reporting a swap minimum error: %j", (unavailable) => {
    const form = calculateOrder({ ...baseParams, module: Module.SWAP, ...unavailable });
    expect(form.isReady).toBe(false);
    expect(form.canSubmit).toBe(false);
    expect(form.errors.primary).toBeUndefined();
    expect(form.errors.swapMinimum).toBeUndefined();
    expect(form.errors.all.some((error) => error.type === InputErrors.INVALID_SWAP_MINIMUM)).toBe(false);
  });

  it("does not require a swap minimum for advanced order modules", () => {
    const form = calculateOrder(baseParams);
    expect(form.isReady).toBe(true);
    expect(form.canSubmit).toBe(true);
    expect(form.errors.swapMinimum).toBeUndefined();
  });

  it("keeps raw, UI, and USD values aligned", () => {
    const form = calculateOrder(baseParams);
    expect(form.values.slippageBps).toBe(300);

    expect(form.inputAmount).toMatchObject({
      raw: "1000000",
      ui: "1",
      usd: "10",
    });
    expect(form.marketPrice).toMatchObject({
      raw: "2000000000000000000",
      ui: "2",
      usd: "10",
    });
    expect(form.outputAmount).toMatchObject({
      raw: "2000000000000000000",
      ui: "2",
      usd: "10",
    });
    expect(form.trades.inputAmountPerTrade.raw).toBe("500000");
    expect(form.fees).toMatchObject({
      raw: "5000000000000000",
      ui: "0.005",
      percentage: 0.25,
    });
  });

  it("rejects an empty limit price instead of constructing zero min-out", () => {
    const form = calculateOrder({
      ...baseParams,
      module: Module.LIMIT,
      userInput: {
        ...baseParams.userInput,
        isMarketOrder: false,
        limitPriceUi: "",
      },
    });

    expect(form.canSubmit).toBe(false);
    expect(form.errors.limitPrice?.type).toBe(InputErrors.MISSING_LIMIT_PRICE);
    expect(form.values.minOutputAmountPerTrade).toBe("0");
  });

  it("supports genuine zero-decimal tokens", () => {
    const form = calculateOrder({
      ...baseParams,
      inputTokenDecimals: 0,
      outputTokenDecimals: 0,
      quotedOutputAmountRaw: "6",
      userInput: {
        ...baseParams.userInput,
        inputAmountUi: "2",
        tradeCount: 1,
      },
    });

    expect(form.inputAmount.ui).toBe("2");
    expect(form.marketPrice.ui).toBe("3");
    expect(form.outputAmount.raw).toBe("6");
  });

  it("derives a limit price and percentage from one authoritative form", () => {
    const form = calculateOrder({
      ...baseParams,
      module: Module.LIMIT,
      userInput: {
        ...baseParams.userInput,
        isMarketOrder: false,
        limitPricePercent: "10",
      },
    });

    expect(form.limitPrice.raw).toBe("2200000000000000000");
    expect(form.limitPrice.percentage).toBe("10");
    expect(form.limitPrice.display.ui).toBe("2.2");
  });

  it("keeps protocol and display units correct for inverted input", () => {
    const form = calculateOrder({
      ...baseParams,
      module: Module.LIMIT,
      userInput: {
        ...baseParams.userInput,
        isMarketOrder: false,
        limitPriceUi: "0.5",
        isPriceInverted: true,
      },
    });

    expect(form.limitPrice.raw).toBe("2000000000000000000");
    expect(form.limitPrice.display).toMatchObject({
      raw: "500000",
      ui: "0.5",
    });
    expect(invertPriceInput(invertPriceInput("2"))).toBe("2");
  });

  it("reports minimum trade size only once", () => {
    const form = calculateOrder({
      ...baseParams,
      minTradeSizeUsd: 20,
      userInput: {
        ...baseParams.userInput,
        tradeCount: 1,
      },
    });

    expect(
      form.errors.all.filter(
        (error) => error.type === InputErrors.MIN_TRADE_SIZE,
      ),
    ).toHaveLength(1);
  });

  it("does not populate duration errors before an amount is entered", () => {
    const form = calculateOrder({
      ...baseParams,
      userInput: {
        ...baseParams.userInput,
        inputAmountUi: "",
        orderDuration: { unit: TimeUnit.Minutes, value: 1 },
      },
    });

    expect(form.errors.duration).toBeUndefined();
  });
});

describe("getOrderFillDelayMillis", () => {
  it("converts v1 seconds but preserves normalized v2 milliseconds", () => {
    expect(
      getOrderFillDelayMillis({ version: 1, fillDelay: 60 } as Order),
    ).toBe(60_000);
    expect(
      getOrderFillDelayMillis({ version: 2, fillDelay: 60_000 } as Order),
    ).toBe(60_000);
  });
});

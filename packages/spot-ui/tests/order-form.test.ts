import { describe, expect, it } from "vitest";
import {
  InputErrors,
  Module,
  TimeUnit,
  calculateOrderForm,
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

describe("calculateOrderForm", () => {
  it("keeps raw, UI, and USD values aligned", () => {
    const form = calculateOrderForm(baseParams);

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
    const form = calculateOrderForm({
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
    const form = calculateOrderForm({
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
    const form = calculateOrderForm({
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
    const form = calculateOrderForm({
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
    const form = calculateOrderForm({
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
    const form = calculateOrderForm({
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

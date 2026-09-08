import { describe, expect, it, vi } from "vitest";
import {
  isFreshQuote,
  isLiquidityHubBetter,
  isNativeAddress,
} from "../src/lib";
import { createQuote } from "./fixtures";

describe("quote helpers", () => {
  it("only treats past quotes inside the age limit as fresh", () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);

    expect(isFreshQuote(createQuote({ timestamp: 99_000 }), 2)).toBe(true);
    expect(isFreshQuote(createQuote({ timestamp: 97_000 }), 2)).toBe(false);
    expect(isFreshQuote(createQuote({ timestamp: 101_000 }), 2)).toBe(false);
    expect(isFreshQuote(createQuote({ timestamp: 99_000 }), -1)).toBe(false);
  });

  it("compares base-unit amounts without throwing on malformed values", () => {
    expect(
      isLiquidityHubBetter(createQuote({ minAmountOut: "201" }), "200"),
    ).toBe(true);
    expect(
      isLiquidityHubBetter(createQuote({ minAmountOut: "invalid" }), "200"),
    ).toBe(false);
    expect(isLiquidityHubBetter(createQuote(), "invalid")).toBe(false);
  });

  it("matches native-token aliases without case sensitivity", () => {
    expect(isNativeAddress("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")).toBe(
      true,
    );
    expect(isNativeAddress("0x0000000000000000000000000000000000000001")).toBe(
      false,
    );
  });
});

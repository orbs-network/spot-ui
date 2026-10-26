import { describe, expect, it } from "vitest";
import { getSwapMinimumOutput } from "../lib/swap-quote";

describe("swap slippage", () => {
  it("uses the net quote with exact base-unit precision", () => {
    expect(getSwapMinimumOutput("270311015092003391", 0.5)).toBe("268959460016543374");
    expect(getSwapMinimumOutput("101", 0.5)).toBe("100");
    expect(getSwapMinimumOutput("101", 0)).toBe("101");
  });

  it("rejects a minimum that rounds below one output base unit", () => {
    expect(() => getSwapMinimumOutput("1", 0.5)).toThrow("too small");
  });

  it.each([-1, 100, NaN, Infinity])("rejects invalid slippage %s", (slippage) => {
    expect(() => getSwapMinimumOutput("100", slippage)).toThrow("Slippage");
  });
});

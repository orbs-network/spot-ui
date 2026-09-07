import { describe, expect, it } from "vitest";
import { isTxRejected } from "../src";

describe("isTxRejected", () => {
  it.each([
    { code: 4001 },
    { code: "ACTION_REJECTED" },
    new Error("User rejected the request"),
    "Transaction denied by the user",
  ])("recognizes wallet rejection: $code$message", (error) => {
    expect(isTxRejected(error)).toBe(true);
  });

  it.each([
    new Error("order already cancelled"),
    new Error("canceled order cannot be found"),
    "submission rejected by the API",
  ])("does not hide an operational error: %s", (error) => {
    expect(isTxRejected(error)).toBe(false);
  });
});

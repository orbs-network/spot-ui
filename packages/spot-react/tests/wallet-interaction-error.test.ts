import { describe, expect, expectTypeOf, it } from "vitest";
import { SpotError } from "@orbs-network/spot-ui";
import {
  WalletInteractionError,
  type AllowanceRequest,
  type GetAllowanceProps,
} from "../src/index";
import { WalletInteractionError as InternalWalletInteractionError } from "../src/internal";
import { normalizeError, parseExecutionError } from "../src/parse-execution-error";
import { isTxRejected } from "../src/wallet-interaction-error";

describe("React wallet error boundary", () => {
  it("exposes one wallet error identity and the React allowance-reader input", () => {
    expect(InternalWalletInteractionError).toBe(WalletInteractionError);
    expectTypeOf<AllowanceRequest>().toEqualTypeOf<GetAllowanceProps>();
    expectTypeOf<keyof AllowanceRequest>().toEqualTypeOf<"tokenAddress" | "spenderAddress">();
  });

  it.each(["WRAP_FAILED", "APPROVAL_FAILED", "INSUFFICIENT_ALLOWANCE"] as const)(
    "preserves %s as a wallet failure through normalization and display parsing",
    code => {
      const cause = new Error("Wallet prerequisite did not complete");
      const error = new WalletInteractionError(code, "Review the wallet transaction before retrying.", { cause });

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(SpotError);
      expect(error.name).toBe("WalletInteractionError");
      expect(error.cause).toBe(cause);
      expect(normalizeError(error)).toBe(error);
      expect(parseExecutionError(error)).toEqual({
        code,
        message: "Review the wallet transaction before retrying.",
      });
    },
  );

  it.each([
    { code: 4001 },
    { cause: { code: "4001" } },
    { error: { code: "ACTION_REJECTED" } },
    { error: { message: "The request was rejected by the user." } },
    new Error("User denied transaction signature"),
    "Request cancelled",
  ])("recognizes declined wallet prompts through common host error shapes: %j", error => {
    expect(isTxRejected(error)).toBe(true);
  });

  it.each([
    new Error("Swap order was cancelled"),
    { cause: { message: "RPC request timed out" } },
    { error: { code: "SUBMISSION_FAILED", message: "Order service unavailable" } },
    null,
  ])("keeps transaction and service failures separate from wallet rejection: %j", error => {
    expect(isTxRejected(error)).toBe(false);
  });
});

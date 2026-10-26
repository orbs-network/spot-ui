import { describe, expect, it } from "vitest";
import * as sdk from "@orbs-network/spot-ui";
import * as react from "../src/index";

describe("SDK API available through spot-react", () => {
  it("preserves the existing calculateOrderForm import in both packages", () => {
    expect(sdk.calculateOrderForm).toBe(sdk.calculateOrder);
    expect(react.calculateOrderForm).toBe(sdk.calculateOrder);
  });

  it.each(Object.keys(sdk) as (keyof typeof sdk)[])(
    "re-exports %s so hosts need only spot-react",
    (name) => {
      expect(react).toHaveProperty(name);
      expect(react[name]).toBe(sdk[name]);
    },
  );
});

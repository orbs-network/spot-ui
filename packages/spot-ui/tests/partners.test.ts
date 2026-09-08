// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore The Spot package does not currently publish a type for `raw`.
import * as Spot from "@orbs-network/spot";
import { describe, expect, it } from "vitest";
import { Partners, getPartners } from "../src";

describe("getPartners", () => {
  it("returns only known partners and valid chain IDs", () => {
    const partnerNames = new Set(Object.values(Partners));

    for (const partner of getPartners()) {
      expect(partnerNames.has(partner.name)).toBe(true);
      expect(Number.isSafeInteger(partner.chainId)).toBe(true);
    }
  });

  it("uses Spot config as the source of partner-chain support", () => {
    const raw = Spot.raw as Record<
      string,
      { dex?: Record<string, unknown> } | undefined
    >;
    const configuredRingChains = Object.keys(raw)
      .filter(
        (chainId) =>
          chainId !== "*" &&
          Boolean(Spot.config(Number(chainId), Partners.Ring)),
      )
      .map((chainId) => Number(chainId))
      .sort((a, b) => a - b);
    const returnedRingChains = getPartners()
      .filter(({ name }) => name === Partners.Ring)
      .map(({ chainId }) => chainId);

    expect(returnedRingChains).toEqual(configuredRingChains);
  });
});

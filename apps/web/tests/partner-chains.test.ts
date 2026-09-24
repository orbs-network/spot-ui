import { describe, expect, it } from "vitest";
import { Partners } from "@orbs-network/spot-react";
import { getPartnerChains, parsePartner } from "../lib/spot-partners";

describe("partner network choices", () => {
  it("intersects partner support with configured chains and removes duplicates", () => {
    const chains = [{ id: 1 }, { id: 56 }, { id: 137 }];
    const partners = [
      { name: Partners.Thena, chainId: 56 },
      { name: Partners.Thena, chainId: 56 },
      { name: Partners.Thena, chainId: 999999 },
      { name: Partners.Quick, chainId: 137 },
    ];
    expect(getPartnerChains(chains, partners, Partners.Thena)).toEqual([{ id: 56 }]);
    expect(getPartnerChains(chains, partners, Partners.Quick)).toEqual([{ id: 137 }]);
    expect(getPartnerChains(chains, partners, Partners.Sushiswap)).toEqual([]);
    expect(getPartnerChains(chains, [], Partners.Thena)).toEqual([]);
  });
  it("accepts a partner name and ignores the network in legacy links", () => {
    expect(parsePartner(Partners.Quick)).toBe(Partners.Quick);
    expect(parsePartner(`${Partners.Quick}_56`)).toBe(Partners.Quick);
    expect(parsePartner("unknown_137")).toBe(Partners.Thena);
    expect(parsePartner()).toBe(Partners.Thena);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Partners } from "@orbs-network/spot-react";

const raw = {
  "*": { wm: "global", salt: {}, dex: { external: { type: "global", fee: "global-fee" } } },
  "1": { wm: "chain", dex: { external: { fee: "chain-fee" }, ring: {} } },
  "56": { dex: { thena: {}, unknown: {} } },
  "4663": { dex: { listed: {} } },
  "invalid": { dex: { ring: {} } },
  "0": { dex: { ring: {} } },
};

describe("remote Spot configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => raw })));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("discovers known partners from global and chain overrides", async () => {
    const { getPartners } = await import("../lib/spot-partners");
    expect(await getPartners()).toEqual([
      { name: Partners.External, chainId: 1 },
      { name: Partners.External, chainId: 56 },
      { name: Partners.External, chainId: 4663 },
      { name: Partners.Listed, chainId: 4663 },
      { name: Partners.Ring, chainId: 1 },
      { name: Partners.Thena, chainId: 56 },
    ]);
  });

  it("deduplicates concurrent requests and refreshes after five minutes", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    const { fetchSpotConfig, SPOT_CONFIG_URL } = await import("../lib/spot-config");
    await Promise.all([fetchSpotConfig(), fetchSpotConfig()]);
    await fetchSpotConfig();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(SPOT_CONFIG_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    now.mockReturnValue(301001);
    await fetchSpotConfig();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("allows retry after an HTTP failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    const { fetchSpotConfig } = await import("../lib/spot-config");
    await expect(fetchSpotConfig()).rejects.toThrow("503");
    await expect(fetchSpotConfig()).resolves.toEqual(raw);
  });

  it.each([null, [], {}, { "*": { dex: [] } }, { "*": {}, "1": { dex: { ring: null } } }])(
    "rejects malformed configuration without caching it", async (value) => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => value } as Response);
      const { fetchSpotConfig } = await import("../lib/spot-config");
      await expect(fetchSpotConfig()).rejects.toThrow("Invalid Spot configuration");
      await expect(fetchSpotConfig()).resolves.toEqual(raw);
    },
  );
});

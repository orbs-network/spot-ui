import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { getTokensUsd, type GetTokensUsdParams } from "../src/index";

const tokenA = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
const tokenB = "0x55d398326f99059ff775485246999027b3197955";
const mixedTokenA = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const mixedTokenB = "0x55d398326f99059fF775485246999027B3197955";
const params = { tokenAddresses: [tokenA, tokenB], chainId: 56 };
const prices = () => ({
  [tokenA]: { token: tokenA, priceUsd: "123456789012345678901" },
  [tokenB]: { token: tokenB, priceUsd: "1" },
});

describe("batch token USD lookups", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("batches unique addresses and returns full-precision prices under lowercase keys", async () => {
    const network = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      [mixedTokenB]: { token: mixedTokenB, priceUsd: "1", priceUsdFormatted: "0.00", decimals: 6 },
      [mixedTokenA]: { token: mixedTokenA, priceUsd: "123456789012345678901", priceUsdFormatted: "123.46" },
      "0x1111111111111111111111111111111111111111": null,
    }));
    vi.stubGlobal("fetch", network);
    const controller = new AbortController();
    const tokenAddresses = Object.freeze([mixedTokenA, mixedTokenB, tokenA]);

    const result = await getTokensUsd({ tokenAddresses, chainId: 56, signal: controller.signal });

    expect(result).toEqual({ [tokenA]: "123.456789012345678901", [tokenB]: "0.000000000000000001" });
    expect(network).toHaveBeenCalledOnce();
    const [url, init] = network.mock.calls[0]!;
    expect(url).toBe("https://order-sink-v2.orbs.network/prices");
    expect(init).toMatchObject({
      method: "POST", cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
    });
    expect(JSON.parse(init!.body as string)).toEqual({ chainId: 56, tokenAddresses: [tokenA, tokenB] });
    expect(tokenAddresses).toEqual([mixedTokenA, mixedTokenB, tokenA]);
    expectTypeOf<GetTokensUsdParams["tokenAddresses"]>().toEqualTypeOf<readonly string[]>();
    expectTypeOf(result).toEqualTypeOf<Record<string, string>>();
  });

  it("fetches fresh prices for each call", async () => {
    const network = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(prices()))
      .mockResolvedValueOnce(Response.json({ ...prices(), [tokenA]: { token: tokenA, priceUsd: "2000000000000000000" } }));
    vi.stubGlobal("fetch", network);

    await expect(getTokensUsd(params)).resolves.toHaveProperty(tokenA, "123.456789012345678901");
    await expect(getTokensUsd(params)).resolves.toHaveProperty(tokenA, "2");
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("returns an empty result without fetching for an empty address list", async () => {
    const network = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", network);

    await expect(getTokensUsd({ ...params, tokenAddresses: [] })).resolves.toEqual({});
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    { chainId: 0 }, { chainId: -1 }, { chainId: 1.5 }, { chainId: Number.MAX_SAFE_INTEGER + 1 },
    { tokenAddresses: null }, { tokenAddresses: tokenA },
    { tokenAddresses: [tokenA, "invalid"] }, { tokenAddresses: [tokenA, 42] },
    { tokenAddresses: new Array(1) }, { chainId: 0, tokenAddresses: [] },
  ])("rejects invalid inputs before fetching (%j)", async invalid => {
    const network = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", network);

    await expect(getTokensUsd({ ...params, ...invalid } as GetTokensUsdParams))
      .rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    null, [], "invalid", {},
    { [tokenA]: prices()[tokenA] },
    { ...prices(), [tokenA]: null },
    { ...prices(), [tokenA]: { token: tokenB, priceUsd: "1" } },
    { ...prices(), [tokenA]: { priceUsd: "1" } },
    ...["0", "-1", "1.5", "Infinity", 1].map(priceUsd => ({ ...prices(), [tokenA]: { token: tokenA, priceUsd } })),
  ])("rejects malformed or incomplete responses (%j)", async payload => {
    vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(payload)));

    await expect(getTokensUsd(params)).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 200 });
  });

  it("retains a network failure cause and allows a fresh retry", async () => {
    const cause = new Error("Price backend unavailable");
    const network = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(cause)
      .mockResolvedValueOnce(Response.json(prices()));
    vi.stubGlobal("fetch", network);

    await expect(getTokensUsd(params)).rejects.toMatchObject({ code: "PRICE_LOOKUP_FAILED", cause });
    await expect(getTokensUsd(params)).resolves.toEqual({ [tokenA]: "123.456789012345678901", [tokenB]: "0.000000000000000001" });
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("retains the HTTP status on a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(getTokensUsd(params)).rejects.toMatchObject({ code: "PRICE_LOOKUP_FAILED", status: 503 });
  });

  it("classifies invalid JSON and retains its parsing cause", async () => {
    const cause = new SyntaxError("Invalid JSON");
    const response = Response.json({});
    vi.spyOn(response, "json").mockRejectedValue(cause);
    vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockResolvedValue(response));

    await expect(getTokensUsd(params)).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 200, cause });
  });

  it("propagates an already-aborted signal even for an empty list without fetching", async () => {
    const network = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", network);
    const controller = new AbortController();
    const reason = new Error("Already cancelled");
    controller.abort(reason);

    await expect(getTokensUsd({ ...params, tokenAddresses: [], signal: controller.signal })).rejects.toBe(reason);
    expect(network).not.toHaveBeenCalled();
  });

  it("cancels one pending request without waiting for fetch or affecting another caller", async () => {
    const network = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockResolvedValueOnce(Response.json(prices()));
    vi.stubGlobal("fetch", network);
    const controller = new AbortController();
    const reason = new Error("Cancel this lookup");
    const pending = getTokensUsd({ ...params, signal: controller.signal });
    const rejected = expect(pending).rejects.toBe(reason);
    const other = getTokensUsd(params);

    controller.abort(reason);

    await rejected;
    await expect(other).resolves.toHaveProperty(tokenA, "123.456789012345678901");
    expect(network.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("propagates cancellation while response JSON is still pending", async () => {
    let parsingStarted!: () => void;
    const parsing = new Promise<void>(resolve => { parsingStarted = resolve; });
    const response = Response.json({});
    vi.spyOn(response, "json").mockImplementation(() => {
      parsingStarted();
      return new Promise<never>(() => {});
    });
    vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockResolvedValue(response));
    const controller = new AbortController();
    const reason = new Error("Stop parsing");
    const pending = getTokensUsd({ ...params, signal: controller.signal });
    const rejected = expect(pending).rejects.toBe(reason);
    await parsing;

    controller.abort(reason);

    await rejected;
  });

  it("propagates fetch AbortErrors unchanged", async () => {
    const cause = new DOMException("Cancelled by fetch", "AbortError");
    vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockRejectedValue(cause));

    await expect(getTokensUsd(params)).rejects.toBe(cause);
  });
});

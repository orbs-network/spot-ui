import { afterEach, describe, expect, it, vi } from "vitest";
import { getQuote, isQuoteFresh, QuoteError, Partners } from "../src";

const params = {
  chainId: 56, partner: Partners.Thena,
  inToken: "0x55d398326f99059fF775485246999027B3197955",
  inAmount: "200000000000000000000",
  outToken: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  user: "0x0000000000000000000000000000000000000001",
  slippage: 0.5,
};
const quote = { amountOut: "1000", netAmountOut: "990", minimumAmountOut: "940", feeAmount: "10" };

afterEach(() => vi.unstubAllGlobals());

describe("getQuote", () => {
  it("forwards the Liquidity Hub quote inputs using the order-sink field names", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(quote)));
    const signal = new AbortController().signal;
    const result = await getQuote({ ...params, signal });
    expect(result).toMatchObject(quote);
    expect(result.request).toEqual({ ...params, dexMinAmountOut: "-1" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.request)).toBe(true);
    expect(isQuoteFresh(result, 1000, result.receivedAt + 1000)).toBe(true);
    expect(isQuoteFresh(result, 1000, result.receivedAt + 1001)).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      "https://order-sink-v2.orbs.network/quote?chainId=56&partner=thena",
      expect.objectContaining({
        method: "POST", signal,
        body: JSON.stringify({ inToken: params.inToken, inAmount: params.inAmount, outToken: params.outToken, user: params.user, slippage: 50, outAmount: "-1" }),
      }),
    );
  });

  it.each([[0.29, 29], [1, 100], [0.125, 13]])(
    "converts %s percent to %s integer basis points",
    async (slippage, expectedBps) => {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(quote)));
      await getQuote({ ...params, slippage });
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
      expect(body.slippage).toBe(expectedBps);
      expect(Number.isInteger(body.slippage)).toBe(true);
    },
  );

  it.each([-1, 100, NaN, Infinity])("rejects invalid slippage %s before fetching", async (slippage) => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(getQuote({ ...params, slippage })).rejects.toThrow("Slippage");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves an explicit DEX minimum and zero slippage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(quote)));
    await getQuote({ ...params, slippage: 0, dexMinAmountOut: "950" });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ slippage: 0, outAmount: "950" });
  });

  it("preserves HTTP status, server code, and retryability without parsing messages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "NO_LIQUIDITY", message: "No offer" } }, { status: 422 })));
    await expect(getQuote(params)).rejects.toMatchObject({ name: "QuoteError", kind: "http", status: 422, code: "NO_LIQUIDITY", retryable: false });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(getQuote(params)).rejects.toMatchObject({ status: 503, retryable: true });
  });

  it("distinguishes an empty offer from a request failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(getQuote(params)).rejects.toMatchObject({ kind: "no-quote", retryable: false });
  });

  it("preserves cancellation during body decoding", async () => {
    const controller = new AbortController();
    const error = new DOMException("Aborted body", "AbortError");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => { controller.abort(error); throw error; } })));
    await expect(getQuote({ ...params, signal: controller.signal })).rejects.toBe(error);
  });

  it("preserves cancellation and types network failures", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn(async () => { throw error; }));
    await expect(getQuote({ ...params, signal: controller.signal })).rejects.toBe(error);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Offline"); }));
    await expect(getQuote(params)).rejects.toBeInstanceOf(QuoteError);
    await expect(getQuote(params)).rejects.toMatchObject({ kind: "network", retryable: true });
  });

  it("surfaces API errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Unsupported pair" }, { status: 400 })));
    await expect(getQuote(params)).rejects.toThrow("Unsupported pair");
  });

  it("surfaces a readable error for non-JSON error bodies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })));
    await expect(getQuote(params)).rejects.toThrow("Unable to fetch swap quote");
  });

  it.each([
    { netAmountOut: "0" }, { netAmountOut: 1000 },
    { minimumAmountOut: "NaN" }, { minimumAmountOut: "991" }, { minimumAmountOut: "0" },
  ])("rejects unusable quote amounts %o", async (invalid) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...quote, ...invalid })));
    await expect(getQuote(params)).rejects.toThrow("No executable swap quote");
  });
});

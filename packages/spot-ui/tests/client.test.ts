import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Module,
  calculateOrder,
  createClient,
  Partners,
  QuoteError,
  SpotError,
  type RePermitData,
} from "../src";
import {
  ADDRESS_1,
  ADDRESS_2,
  ADDRESS_3,
  createRePermitData,
  createV2Order,
} from "./fixtures";
import { buildV2Order } from "../src/lib/orders/v2-orders";

const partner = Partners.Thena;
const chainId = 56;

const createForm = () =>
  calculateOrder({
    module: Module.TWAP,
    inputTokenDecimals: 6,
    outputTokenDecimals: 18,
    quotedOutputAmountRaw: "2000000000000000000",
    inputTokenUsdPrice: "10",
    outputTokenUsdPrice: "5",
    minTradeSizeUsd: 1,
    priceProtectionPercent: 3,
    userInput: {
      inputAmountUi: "1",
      isMarketOrder: true,
      tradeCount: 2,
    },
  });

describe("createClient", () => {
  let responseData: RePermitData;

  beforeEach(() => {
    responseData = createRePermitData(chainId);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => responseData,
      })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("quotes with the client's chain and partner and forwards the remaining inputs", async () => {
    const client = await createClient(partner, chainId, { disableAnalytics: true });
    const signal = new AbortController().signal;
    const params = {
      inToken: ADDRESS_2, outToken: ADDRESS_3, inAmount: "1000000",
      user: ADDRESS_1, slippage: 0.5, dexMinAmountOut: "900", signal,
      // A JavaScript caller cannot override configuration captured by the client.
      chainId: 137, partner: Partners.Quick,
    };
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      amountOut: "1000", netAmountOut: "990", minimumAmountOut: "940", feeAmount: "10",
    }));

    const quote = await client.getQuote(params);
    expect(quote.request).toEqual({
      inToken: ADDRESS_2, outToken: ADDRESS_3, inAmount: "1000000",
      user: ADDRESS_1, slippage: 0.5, dexMinAmountOut: "900", chainId, partner,
    });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://order-sink-v2.orbs.network/quote?chainId=56&partner=thena",
      expect.objectContaining({
        signal,
        body: JSON.stringify({ inToken: ADDRESS_2, inAmount: "1000000", outToken: ADDRESS_3, user: ADDRESS_1, slippage: 50, outAmount: "900" }),
      }),
    );
  });

  it("preserves quote error classification and abort identity through the bound method", async () => {
    const client = await createClient(partner, chainId, { disableAnalytics: true });
    const params = { inToken: ADDRESS_2, outToken: ADDRESS_3, inAmount: "1000000", user: ADDRESS_1, slippage: 0.5 };
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ message: "No liquidity", code: "NO_LIQUIDITY" }, { status: 422 }));
    const error = await client.getQuote(params).catch(error => error);
    expect(error).toBeInstanceOf(QuoteError);
    expect(error).toMatchObject({ kind: "http", status: 422, code: "NO_LIQUIDITY", retryable: false });

    const abort = new DOMException("Quote cancelled", "AbortError");
    vi.mocked(fetch).mockRejectedValueOnce(abort);
    await expect(client.getQuote(params)).rejects.toBe(abort);
  });

  it("classifies transport, HTTP, and invalid-payload lookup failures", async () => {
    const client = await createClient(partner, chainId, { disableAnalytics: true });
    const cause = new TypeError("Offline");
    vi.mocked(fetch).mockRejectedValueOnce(cause);
    await expect(client.getOrder({ orderId: "0x1234" })).rejects.toMatchObject({ code: "ORDER_LOOKUP_FAILED", cause });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    await expect(client.getOrder({ orderId: "0x1234" })).rejects.toMatchObject({ code: "ORDER_LOOKUP_FAILED", status: 503 });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({}));
    await expect(client.getOrder({ orderId: "0x1234" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("preserves cancellation while reading an order response", async () => {
    const client = await createClient(partner, chainId, { disableAnalytics: true });
    const abort = new DOMException("Lookup cancelled", "AbortError");
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw abort; } } as Response);
    await expect(client.getOrder({ orderId: "0x1234" })).rejects.toBe(abort);
  });

  it("exposes stable SDK errors for invalid forms and unavailable cancellation contracts", async () => {
    const client = await createClient(partner, chainId, { disableAnalytics: true });
    expect(() => client.prepareOrder({
      form: { ...createForm(), canSubmit: false }, inputTokenAddress: ADDRESS_2,
      outputTokenAddress: ADDRESS_3, swapperAddress: ADDRESS_1,
    })).toThrowError(expect.objectContaining({ name: "SpotError", code: "FORM_NOT_SUBMITTABLE" }));
    const order = buildV2Order(createV2Order(chainId, "0x1234"));
    expect(() => client.getCancelOrderRequest({ ...order, version: 1, twapAddress: undefined }))
      .toThrowError(expect.objectContaining({ code: "CANCELLATION_UNAVAILABLE" }));
  });

  it("fetches a single order by full hash and chain without a legacy exchange filter", async () => {
    const client = await createClient(partner, chainId, { disableAnalytics: true });
    const rawOrder = createV2Order(chainId, "0x1234");
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ orders: [rawOrder] }));
    const signal = new AbortController().signal;
    const result = await client.getOrder({ orderId: rawOrder.hash, signal });
    expect(result?.id).toBe(rawOrder.hash);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://order-sink-v2.orbs.network/orders?hash=0x1234&chainId=56",
      { signal, cache: "no-store" },
    );
  });

  it.each([
    { orders: [] },
    { orders: [createV2Order(chainId, "0x123456")] },
    { orders: [createV2Order(chainId + 1, "0x1234")] },
  ])("does not match missing, partial-hash, or different-chain orders: %j", async ({ orders }) => {
    const client = await createClient(partner, chainId, { disableAnalytics: true });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ orders }));
    await expect(client.getOrder({ orderId: "0x1234" })).resolves.toBeUndefined();
  });

  it("uses order-sink directly for a new partner/chain pair", async () => {
    const newChainId = 123456;
    responseData = createRePermitData(newChainId);
    const client = await createClient(Partners.Ring, newChainId);
    expect(client.chainId).toBe(newChainId);
    const configRequests = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method !== "POST");
    expect(configRequests).toEqual([
      ["https://order-sink-v2.orbs.network/config?partner=ring&chain=123456"],
    ]);
  });

  it("surfaces unsupported pairs rejected by order-sink", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false, status: 400, text: async () => "Unsupported partner/chain",
    } as Response);
    await expect(createClient(Partners.Ring, chainId)).rejects.toThrow("Unsupported partner/chain");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid chain ID %s before fetching", async (invalidChainId) => {
    await expect(createClient(partner, invalidChainId)).rejects.toMatchObject({
      name: "SpotError", code: "INVALID_ARGUMENT", message: "chainId must be a positive safe integer",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      "domain chain",
      (data: RePermitData) => {
        data.domain.chainId = chainId + 1;
      },
      "domain.chainId",
    ],
    [
      "order chain",
      (data: RePermitData) => {
        data.order.witness.chainid = chainId + 1;
      },
      "order.witness.chainid",
    ],
    [
      "RePermit address",
      (data: RePermitData) => {
        data.domain.verifyingContract =
          "0x0000000000000000000000000000000000000000";
      },
      "domain.verifyingContract",
    ],
    [
      "adapter address",
      (data: RePermitData) => {
        data.order.witness.exchange.adapter = "0x123";
      },
      "order.witness.exchange.adapter",
    ],
  ])("rejects an invalid %s", async (_label, mutate, expectedField) => {
    mutate(responseData);
    const error = await createClient(partner, chainId).catch(error => error);
    expect(error).toBeInstanceOf(SpotError);
    expect(error).toMatchObject({ code: "INVALID_CONFIGURATION", message: expect.stringContaining(expectedField) });
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it.each([null, []])("classifies malformed configuration %j before analytics initialization", async (config) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(config));
    await expect(createClient(partner, chainId)).rejects.toMatchObject({ name: "SpotError", code: "INVALID_CONFIGURATION" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("initializes analytics from validated config without window or appId", async () => {
    vi.stubGlobal("window", undefined);
    responseData.partner = "Thena from order-sink";
    const client = await createClient(partner, chainId);
    expect(client.rePermitData).toEqual(responseData);

    const payloads = vi.mocked(fetch).mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      action: "module-import", partner, chainId,
      name: responseData.partner,
      adapter: responseData.order.witness.exchange.adapter,
      repermit: responseData.domain.verifyingContract,
      domainName: responseData.domain.name,
      domainVersion: responseData.domain.version,
      primaryType: responseData.primaryType,
      spender: responseData.order.spender,
      exchangeRef: responseData.order.witness.exchange.ref,
      exchangeShare: responseData.order.witness.exchange.share,
      exchangeData: responseData.order.witness.exchange.data,
    });
    for (const payload of payloads) {
      expect(payload).not.toHaveProperty("appId");
      expect(payload).not.toHaveProperty("spotVersion");
      expect(payload).not.toHaveProperty("minChunkSizeUsd");
      expect(payload).not.toHaveProperty("minTradeSizeUsd");
      expect(payload).not.toHaveProperty("origin");
    }

    vi.mocked(fetch).mockClear();
    const secondClient = await createClient(partner, chainId);
    expect(secondClient.analytics).not.toBe(client.analytics);
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);

  });

  it("still creates the client when telemetry delivery fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") throw new Error("BI unavailable");
      return { ok: true, json: async () => responseData } as Response;
    });

    await expect(createClient(partner, chainId)).resolves.toMatchObject({ partner, chainId });
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
  });

  it("creates strictly increasing nonces within one client", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const client = await createClient(partner, chainId);
    const form = createForm();

    const first = client.prepareOrder({
      form,
      inputTokenAddress: ADDRESS_2,
      outputTokenAddress: ADDRESS_3,
      swapperAddress: ADDRESS_1,
    });
    const second = client.prepareOrder({
      form,
      inputTokenAddress: ADDRESS_2,
      outputTokenAddress: ADDRESS_3,
      swapperAddress: ADDRESS_1,
    });

    expect(BigInt(second.order.nonce)).toBeGreaterThan(
      BigInt(first.order.nonce),
    );
  });

  it("requires callers to normalize native input to its wrapped token", async () => {
    const client = await createClient(partner, chainId);

    expect(() =>
      client.prepareOrder({
        form: createForm(),
        inputTokenAddress: "0x0000000000000000000000000000000000000000",
        outputTokenAddress: ADDRESS_3,
        swapperAddress: ADDRESS_1,
      }),
    ).toThrow("pass the host-provided wrapped native token");
  });

  it("signs the exact swap minimum as a single limit order", async () => {
    const client = await createClient(partner, chainId, { disableAnalytics: true });
    const form = calculateOrder({
      module: Module.SWAP,
      inputTokenDecimals: 6,
      outputTokenDecimals: 18,
      quotedOutputAmountRaw: "270311015092003391",
      minimumOutputAmountRaw: "268959460016543374",
      inputTokenUsdPrice: "1",
      minTradeSizeUsd: 1,
      priceProtectionPercent: 0.5,
      userInput: { inputAmountUi: "200", isMarketOrder: true },
    });
    const prepared = client.prepareOrder({
      form, inputTokenAddress: ADDRESS_2, outputTokenAddress: ADDRESS_3, swapperAddress: ADDRESS_1,
    });
    expect(prepared.order.witness.epoch).toBe(0);
    expect(prepared.values.deadlineMillis - prepared.values.currentTimeMillis).toBe(900_000);
    expect(Number(prepared.order.witness.deadline) - Number(prepared.order.witness.start)).toBe(900);
    expect(prepared.signingRequest.typedData.message.witness.slippage).toBe(500);
    expect(prepared.order.witness.input.amount).toBe("200000000");
    expect(prepared.order.witness.output).toMatchObject({
      limit: "268959460016543374", triggerLower: "0", triggerUpper: "0",
    });
    expect(prepared.signingRequest.typedData.message).toBe(prepared.order);
    expect(prepared.approvalRequest.amount).toBe("200000000");
  });
});

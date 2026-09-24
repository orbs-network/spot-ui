import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import {
calculateOrderForm,
createClient,
Module,
Partners,
type RePermitData,
} from "../src/index";
import {
ADDRESS_1,
ADDRESS_2,
ADDRESS_3,
createRePermitData,
} from "./fixtures";

const partner = Partners.Thena;
const chainId = 56;

const createForm = () =>
  calculateOrderForm({
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

  it("uses order-sink directly for a new partner/chain pair", async () => {
    const newChainId = 123456;
    responseData = createRePermitData(newChainId);
    const client = await createClient(Partners.Ring, newChainId);
    expect(client.chainId).toBe(newChainId);
    const configRequests = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method !== "POST");
    expect(configRequests).toEqual([
      ["https://order-sink-v2.orbs.network/config?partner=ring&chain=123456"],
    ]);
  });

  it("surfaces unsupported pairs rejected by order-sink", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Unsupported partner/chain",
    } as Response);
    await expect(createClient(Partners.Ring, chainId)).rejects.toThrow(
      "Unsupported partner/chain",
    );
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    "rejects invalid chain ID %s before fetching",
    async (invalidChainId) => {
      await expect(createClient(partner, invalidChainId)).rejects.toThrow(
        "chainId must be a positive safe integer",
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

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
    await expect(createClient(partner, chainId)).rejects.toThrow(expectedField);
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });

  it("initializes analytics from validated config without window or appId", async () => {
    vi.stubGlobal("window", undefined);
    responseData.partner = "Thena from order-sink";
    const client = await createClient(partner, chainId);
    expect(client.rePermitData).toEqual(responseData);

    const payloads = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      action: "module-import",
      partner,
      chainId,
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
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(true);
  });

  it("still creates the client when telemetry delivery fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === "POST") throw new Error("BI unavailable");
      return { ok: true, json: async () => responseData } as Response;
    });

    await expect(createClient(partner, chainId)).resolves.toMatchObject({
      partner,
      chainId,
    });
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(true);
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
});

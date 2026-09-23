import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analytics, Partners } from "../src";
import { fetchRePermitData } from "../src/lib/build-repermit-order-data";
import { createRePermitData } from "./fixtures";

describe("Spot analytics", () => {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      ({ ok: true }) as Response,
  );

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("never includes a signed order or wallet signature in BI payloads", async () => {
    analytics.onSignOrderRequest(createRePermitData(1).order);
    analytics.onSignOrderSuccess("0xsigned-secret");

    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(payload.action).toBe("sign order");
    expect(payload).not.toHaveProperty("order");
    expect(payload).not.toHaveProperty("signature");
  });

  it("normalizes provider-shaped errors without throwing", async () => {
    expect(() => analytics.onSignOrderError({ code: 4001 })).not.toThrow();

    await vi.runAllTimersAsync();

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(payload.actionError).toBe("4001");
  });

  it("uses only order-sink configuration for analytics, including after reset", async () => {
    const permitData = { ...createRePermitData(1), partner: "Sushi from order-sink" };
    permitData.order.witness.exchange.share = 25;
    permitData.order.witness.exchange.data = "0x1234";
    permitData.order.witness.freshness = 120;
    permitData.order.witness.exclusivity = 10;
    permitData.order.witness.epoch = 60;
    permitData.order.witness.slippage = 50;
    permitData.order.nonce = "private-order-nonce";
    const legacyFields = [
      "cosigner", "fee", "refinery", "router", "type", "wm", "chainName",
      "twapVersion", "twapAddress", "lensAddress", "bidDelaySeconds",
      "exchangeAddress", "exchangeType", "pathfinderKey", "minChunkSizeUsd", "minTradeSizeUsd", "spotVersion",
    ];
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => permitData } as Response);
    const config = await fetchRePermitData(Partners.Sushiswap, 1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://order-sink-v2.orbs.network/config?partner=sushiswap&chain=1",
    );
    fetchMock.mockClear();

    analytics.init(Partners.Sushiswap, config);

    const expected = {
      name: "Sushi from order-sink",
      adapter: permitData.order.witness.exchange.adapter,
      executor: permitData.order.witness.executor,
      reactor: permitData.order.witness.reactor,
      repermit: permitData.domain.verifyingContract,
      chainId: permitData.domain.chainId,
      domainName: permitData.domain.name,
      domainVersion: permitData.domain.version,
      primaryType: permitData.primaryType,
      spender: permitData.order.spender,
      exchangeRef: permitData.order.witness.exchange.ref,
      exchangeShare: 25,
      exchangeData: "0x1234",
      configFreshness: 120,
      configExclusivity: 10,
      configEpoch: 60,
      configSlippage: 50,
    };
    expect(fetchMock).toHaveBeenCalledOnce();
    const readPayload = (index: number) => JSON.parse(String(fetchMock.mock.calls[index]?.[1]?.body));
    const payload = readPayload(0);
    expect(payload).toMatchObject({ action: "module-import", ...expected });
    for (const field of legacyFields) expect(payload).not.toHaveProperty(field);
    expect(JSON.stringify(payload)).not.toContain("private-order-nonce");
    expect(payload).not.toHaveProperty("order");
    expect(payload).not.toHaveProperty("signature");

    await analytics.onCreateOrderSuccess("order-hash");
    await vi.runAllTimersAsync();
    analytics.onCreateOrderRequest();
    await vi.runAllTimersAsync();
    const resetPayload = readPayload(fetchMock.mock.calls.length - 1);
    expect(resetPayload).toMatchObject({ action: "create order", ...expected });
    for (const field of legacyFields) expect(resetPayload).not.toHaveProperty(field);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "POST")).toBe(true);
  });
  it("logs changed configuration while deduplicating unchanged initialization", () => {
    const config = createRePermitData(137);
    analytics.init(Partners.Quick, config);
    analytics.init(Partners.Quick, config);
    expect(fetchMock).toHaveBeenCalledOnce();

    const updated = { ...config, domain: { ...config.domain, version: "2" } };
    analytics.init(Partners.Quick, updated);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      action: "module-import",
      domainVersion: "2",
    });
  });

});

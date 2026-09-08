import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analytics } from "../src";
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
});

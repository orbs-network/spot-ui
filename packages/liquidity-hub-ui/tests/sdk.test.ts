import { afterEach, describe, expect, it, vi } from "vitest";
import { constructSDK } from "../src/lib";
import { createQuote, jsonResponse } from "./fixtures";

const quoteArgs = {
  fromToken: "0x0000000000000000000000000000000000000001",
  toToken: "0x0000000000000000000000000000000000000002",
  inAmount: "100",
  dexMinAmountOut: "190",
  account: "0x0000000000000000000000000000000000000003",
  slippage: 0.5,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LiquidityHubSDK", () => {
  it("uses and normalizes a custom API base URL", async () => {
    let requestUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = String(input);
        return jsonResponse(createQuote());
      }),
    );
    const sdk = constructSDK({
      chainId: 42161,
      partner: "test-partner",
      apiUrl: "/api/liquidity-hub/",
      blockAnalytics: true,
    });

    await sdk.getQuote(quoteArgs);

    expect(requestUrl).toBe("/api/liquidity-hub/quote?chainId=42161");
  });

  it("rejects an empty custom API URL", () => {
    expect(() =>
      constructSDK({ chainId: 42161, partner: "test", apiUrl: "  " }),
    ).toThrow("apiUrl must not be empty");
  });

  it("keeps quote sessions isolated between SDK instances", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const partnerCounts = new Map<string, number>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requests.push(body);
        const partner = String(body.partner);
        const count = (partnerCounts.get(partner) ?? 0) + 1;
        partnerCounts.set(partner, count);

        return jsonResponse(
          createQuote({
            inToken: String(body.inToken),
            outToken: String(body.outToken),
            inAmount: String(body.inAmount),
            user: String(body.user),
            partner,
            sessionId: `${partner}-${count}`,
          }),
        );
      }),
    );
    const alpha = constructSDK({
      chainId: 137,
      partner: "Alpha",
      blockAnalytics: true,
    });
    const beta = constructSDK({
      chainId: 137,
      partner: "Beta",
      blockAnalytics: true,
    });

    await alpha.getQuote(quoteArgs);
    await beta.getQuote(quoteArgs);
    await alpha.getQuote(quoteArgs);

    expect(requests[0]?.sessionId).toBeUndefined();
    expect(requests[1]?.sessionId).toBeUndefined();
    expect(requests[2]?.sessionId).toBe("alpha-1");
    expect(alpha.analytics.liquidityHubId).toBe("alpha-2");
    expect(beta.analytics.liquidityHubId).toBe("beta-1");
  });

  it("keeps the newest session when quote responses arrive out of order", async () => {
    const resolvers = new Map<string, (response: Response) => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Promise<Response>((resolve) => {
          resolvers.set(String(body.inAmount), resolve);
        });
      }),
    );
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });
    const first = sdk.getQuote({ ...quoteArgs, inAmount: "100" });
    const second = sdk.getQuote({ ...quoteArgs, inAmount: "200" });

    resolvers.get("200")?.(
      jsonResponse(
        createQuote({
          inAmount: "200",
          partner: "test",
          sessionId: "newest-session",
        }),
      ),
    );
    await second;
    resolvers.get("100")?.(
      jsonResponse(
        createQuote({
          inAmount: "100",
          partner: "test",
          sessionId: "older-session",
        }),
      ),
    );
    await first;

    expect(sdk.analytics.liquidityHubId).toBe("newest-session");
  });

  it("does not let an older response replace a newer session for identical inputs", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    );
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });
    const first = sdk.getQuote(quoteArgs);
    const second = sdk.getQuote(quoteArgs);

    resolvers[1]?.(
      jsonResponse(createQuote({ partner: "test", sessionId: "newest" })),
    );
    await second;
    resolvers[0]?.(
      jsonResponse(createQuote({ partner: "test", sessionId: "older" })),
    );
    await first;

    expect(sdk.analytics.liquidityHubId).toBe("newest");
  });

  it("never includes wallet signatures in analytics payloads", () => {
    const payloads: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        payloads.push(JSON.parse(String(init?.body)) as unknown);
        return jsonResponse({});
      }),
    );
    const sdk = constructSDK({ chainId: 137, partner: "test" });

    sdk.analytics.signature.onRequest();
    sdk.analytics.signature.onSuccess("sensitive-wallet-signature");

    expect(JSON.stringify(payloads)).not.toContain(
      "sensitive-wallet-signature",
    );
  });

  it("aborts the network request when a quote times out", async () => {
    let requestWasAborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const requestSignal = init?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal.addEventListener("abort", () => {
            requestWasAborted = requestSignal.aborted;
            reject(requestSignal.reason);
          });
        });
      }),
    );
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });

    await expect(sdk.getQuote({ ...quoteArgs, timeout: 5 })).rejects.toThrow(
      "quote request timed out",
    );
    expect(requestWasAborted).toBe(true);
  });

  it("rejects malformed quote responses at the API boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ outAmount: "1" })),
    );
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });

    await expect(sdk.getQuote(quoteArgs)).rejects.toThrow(
      "quote is missing inToken",
    );
  });

  it("rejects a quote that does not match its request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(createQuote({ inAmount: "101" }))),
    );
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });

    await expect(sdk.getQuote(quoteArgs)).rejects.toThrow(
      "quote does not match",
    );
  });

  it("rejects a quote returned for another partner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(createQuote({ partner: "other" }))),
    );
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });

    await expect(sdk.getQuote(quoteArgs)).rejects.toThrow(
      "quote does not match",
    );
  });

  it("preserves caller cancellation as an abort", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal as AbortSignal;
            signal.addEventListener("abort", () => reject(signal.reason));
          }),
      ),
    );
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });
    const request = sdk.getQuote({ ...quoteArgs, signal: controller.signal });

    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("uses a transaction hash returned directly by swap submission", async () => {
    let statusRequests = 0;
    let submissionUrl = "";
    let submittedBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/swap-async")) {
          submissionUrl = url;
          submittedBody = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          return Promise.resolve(jsonResponse({ txHash: "0xabc" }));
        }

        statusRequests++;
        const statusSignal = init?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          statusSignal.addEventListener("abort", () => {
            reject(statusSignal.reason);
          });
        });
      }),
    );
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      apiUrl: "/api/liquidity-hub/",
      blockAnalytics: true,
    });

    await expect(sdk.swap(createQuote(), "0xsignature")).resolves.toBe("0xabc");
    expect(submittedBody?.timestamp).toBeUndefined();
    expect(submittedBody?.signature).toBe("0xsignature");
    expect(submissionUrl).toBe("/api/liquidity-hub/swap-async?chainId=137");
    expect(statusRequests).toBe(0);
  });

  it("prevents duplicate submissions while a swap is active", async () => {
    let resolveSubmission: ((response: Response) => void) | undefined;
    const submission = new Promise<Response>((resolve) => {
      resolveSubmission = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("/swap-async")) return submission;

        const signal = init?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        });
      }),
    );
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });
    const quote = createQuote();
    const firstSwap = sdk.swap(quote, "0xsignature");

    await expect(sdk.swap(quote, "0xsignature")).rejects.toThrow(
      "already in progress",
    );
    resolveSubmission?.(jsonResponse({ txHash: "0xabc" }));
    await expect(firstSwap).resolves.toBe("0xabc");
  });

  it("allows a new submission after a swap failure", async () => {
    let submissionCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("/swap-async")) {
          submissionCount++;
          return Promise.resolve(
            submissionCount === 1
              ? jsonResponse({ error: "invalid signature" }, 400)
              : jsonResponse({ txHash: "0xretry" }),
          );
        }

        const signal = init?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        });
      }),
    );
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });
    const quote = createQuote();

    await expect(sdk.swap(quote, "0xbad")).rejects.toThrow("invalid signature");
    await expect(sdk.swap(quote, "0xgood")).resolves.toBe("0xretry");
  });

  it("times out stalled swap requests and releases the submission lock", async () => {
    vi.useFakeTimers();
    let stalled = true;
    const fetchMock = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (!stalled && String(input).includes("/swap-async")) {
          return Promise.resolve(jsonResponse({ txHash: "0xretry" }));
        }

        const signal = init?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });
    const quote = createQuote();

    const firstSwap = sdk.swap(quote, "0xsignature");
    const timedOut = expect(firstSwap).rejects.toThrow("swap timed out");
    await vi.advanceTimersByTimeAsync(60_000);
    await timedOut;

    stalled = false;
    await expect(sdk.swap(createQuote(), "0xsignature")).resolves.toBe(
      "0xretry",
    );
  });

  it("rejects stale quotes before starting a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const sdk = constructSDK({
      chainId: 137,
      partner: "test",
      blockAnalytics: true,
    });

    await expect(
      sdk.swap(createQuote({ timestamp: Date.now() - 61_000 }), "0xsignature"),
    ).rejects.toThrow("quote expired");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

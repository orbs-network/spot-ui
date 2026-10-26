import { afterEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "../src/lib/analytics";
import { fetchRePermitData } from "../src/lib/build-repermit-order-data";
import { SpotError } from "../src/lib/errors";
import { executeOrder, type ExecuteOrderParams, type OrderWalletInteractions, type SignableOrder } from "../src/lib/execute-order";
import { submitOrder } from "../src/lib/submit-order";
import { getMinimumOutputAmount } from "../src/lib/swap-amounts";
import { validateSwap, type PrepareSwapParams } from "../src/lib/swap";
import { Partners, type Order } from "../src/lib/types";
import { ADDRESS_1, ADDRESS_2, ADDRESS_3, ADDRESS_4, createRePermitData, createV2Order } from "./fixtures";

const setupExecution = (): ExecuteOrderParams<SignableOrder> => {
  const config = createRePermitData(56);
  const prepared: SignableOrder = {
    order: config.order,
    signingRequest: { signerAddress: ADDRESS_1, typedData: { ...config, message: config.order } },
    approvalRequest: { tokenAddress: ADDRESS_2, amount: "100", spenderAddress: ADDRESS_4 },
  };
  return {
    client: { spenderAddress: ADDRESS_4, analytics: new Analytics(true), submitOrder: vi.fn(async () => ({ id: "0xaccepted" }) as Order) },
    account: ADDRESS_1, inputTokenAddress: ADDRESS_2, inputAmountRaw: "100", prepareOrder: () => prepared,
    walletInteractions: {
      getAllowance: vi.fn(async () => "100"), wrapNativeToken: vi.fn(async () => "0xwrap"),
      approveToken: vi.fn(async () => "0xapprove"), signOrder: vi.fn(async () => "0xsigned"),
    },
    wait: vi.fn(async () => undefined),
  };
};
const swapParams = (): PrepareSwapParams => ({
  swapperAddress: ADDRESS_1, minimumOutputAmountRaw: "190",
  quote: {
    request: { chainId: 56, partner: Partners.Thena, inToken: ADDRESS_2, outToken: ADDRESS_3, inAmount: "100", user: ADDRESS_1, slippage: 0.5 },
    receivedAt: Date.now(), amountOut: "201", netAmountOut: "200", minimumAmountOut: "199", feeAmount: "1",
  },
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("stable SDK errors", () => {
  it("retains the Error contract and original transport details", () => {
    const cause = new TypeError("Connection closed");
    const error = new SpotError("SUBMISSION_FAILED", cause.message, { cause, status: 502, serviceCode: "UPSTREAM" });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: "SpotError", code: "SUBMISSION_FAILED", message: "Connection closed", cause, status: 502, serviceCode: "UPSTREAM" });
    expect(error.stack).toContain("Connection closed");
  });

  it.each([
    ["0", 0.5, "INVALID_AMOUNT"], ["100", NaN, "INVALID_ARGUMENT"], ["1", 0.5, "INVALID_AMOUNT"],
  ] as const)("classifies minimum-output errors for %s at %s percent", (raw, slippage, code) => {
    expect(() => getMinimumOutputAmount(raw, slippage)).toThrowError(expect.objectContaining({ name: "SpotError", code }));
  });

  it.each([
    ["UNSUPPORTED_SWAP", (params: PrepareSwapParams) => { params.tradeType = "exact-output"; }],
    ["QUOTE_CONTEXT_MISMATCH", (params: PrepareSwapParams) => { params.quote = { ...params.quote, request: { ...params.quote.request, chainId: 1 } }; }],
    ["INVALID_ARGUMENT", (params: PrepareSwapParams) => { params.quote = { ...params.quote, request: { ...params.quote.request, outToken: "invalid" } }; }],
    ["INVALID_AMOUNT", (params: PrepareSwapParams) => { params.minimumOutputAmountRaw = "0"; }],
    ["INVALID_QUOTE", (params: PrepareSwapParams) => { params.minimumOutputAmountRaw = "201"; }],
    ["STALE_QUOTE", (params: PrepareSwapParams) => { params.maxQuoteAgeMillis = 1; params.quote = { ...params.quote, receivedAt: Date.now() - 100 }; }],
  ] as const)("classifies %s without message matching", (code, change) => {
    const params = swapParams();
    change(params);
    expect(() => validateSwap(params, 56, Partners.Thena)).toThrowError(expect.objectContaining({ name: "SpotError", code }));
  });
});

describe("execution error boundaries", () => {
  it("classifies duplicate execution while preserving the first result", async () => {
    const params = setupExecution();
    let release!: (raw: string) => void;
    vi.mocked(params.walletInteractions.getAllowance).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = executeOrder(params);
    await expect(executeOrder(params)).rejects.toMatchObject({ code: "EXECUTION_IN_PROGRESS" });
    release("100");
    await expect(first).resolves.toMatchObject({ order: { id: "0xaccepted" } });
  });

  it("classifies invalid input before wallet work", async () => {
    const params = setupExecution();
    await expect(executeOrder({ ...params, inputAmountRaw: "0" })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    expect(params.walletInteractions.getAllowance).not.toHaveBeenCalled();
  });

  it.each([
    ["WRAP_FAILED", (params: ExecuteOrderParams<SignableOrder>) => {
      params.nativeInput = true;
      vi.mocked(params.walletInteractions.wrapNativeToken).mockResolvedValue("" as `0x${string}`);
    }],
    ["APPROVAL_FAILED", (params: ExecuteOrderParams<SignableOrder>) => {
      vi.mocked(params.walletInteractions.getAllowance).mockResolvedValue("0");
      vi.mocked(params.walletInteractions.approveToken).mockResolvedValue("" as `0x${string}`);
    }],
    ["INSUFFICIENT_ALLOWANCE", (params: ExecuteOrderParams<SignableOrder>) => {
      vi.mocked(params.walletInteractions.getAllowance).mockResolvedValue("0");
    }],
    ["PREPARED_ORDER_MISMATCH", (params: ExecuteOrderParams<SignableOrder>) => {
      const prepared = params.prepareOrder();
      params.prepareOrder = () => ({ ...prepared, approvalRequest: { ...prepared.approvalRequest, amount: "101" } });
    }],
  ] as const)("classifies SDK-owned %s failures before submission", async (code, change) => {
    const params = setupExecution();
    change(params);
    await expect(executeOrder(params)).rejects.toMatchObject({ name: "SpotError", code });
    expect(params.client.submitOrder).not.toHaveBeenCalled();
  });

  it.each(["getAllowance", "wrapNativeToken", "approveToken", "signOrder"] as const)("preserves errors from wallet.%s", async method => {
    const params = setupExecution();
    const rejection = Object.assign(new Error("User rejected wallet request"), { code: 4001 });
    params.nativeInput = method === "wrapNativeToken";
    if (method === "approveToken") vi.mocked(params.walletInteractions.getAllowance).mockResolvedValue("0");
    const walletMethod = params.walletInteractions[method] as OrderWalletInteractions["signOrder"];
    vi.mocked(walletMethod).mockRejectedValue(rejection);
    await expect(executeOrder(params)).rejects.toBe(rejection);
    expect(params.client.submitOrder).not.toHaveBeenCalled();
  });

  it("preserves host validation and caller abort reasons", async () => {
    const params = setupExecution();
    const changedAccount = new Error("Account changed");
    await expect(executeOrder({ ...params, validateContext: () => { throw changedAccount; } })).rejects.toBe(changedAccount);
    const controller = new AbortController();
    const reason = new DOMException("Stopped tracking", "AbortError");
    controller.abort(reason);
    await expect(executeOrder({ ...params, signal: controller.signal })).rejects.toBe(reason);
    expect(params.walletInteractions.getAllowance).not.toHaveBeenCalled();
  });
});

describe("submission and configuration errors", () => {
  const submit = () => submitOrder(createRePermitData(56).order, "0xsigned", new Analytics(true));
  const mockResponse = (response: Response) => { vi.stubGlobal("fetch", vi.fn(async () => response)); };
  const silenceErrors = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

  it("retains submission transport causes without retrying an acceptance-uncertain request", async () => {
    silenceErrors();
    const cause = new TypeError("Connection closed after sending");
    const fetch = vi.fn(async () => { throw cause; });
    vi.stubGlobal("fetch", fetch);
    await expect(submit()).rejects.toMatchObject({ code: "SUBMISSION_FAILED", cause, message: cause.message });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([400, 200])("preserves rejection details from HTTP %s", async status => {
    silenceErrors();
    mockResponse(Response.json({ success: false, message: "Invalid signature", code: "SIGNATURE" }, { status }));
    await expect(submit()).rejects.toMatchObject({ code: "SUBMISSION_FAILED", status, serviceCode: "SIGNATURE", message: "error:Invalid signature, code:SIGNATURE" });
  });

  it("classifies non-JSON HTTP failures and retains the parsing cause", async () => {
    silenceErrors();
    mockResponse(new Response("upstream failed", { status: 502, statusText: "Bad Gateway" }));
    await expect(submit()).rejects.toMatchObject({ code: "SUBMISSION_FAILED", status: 502, cause: expect.any(SyntaxError) });
  });

  it.each([
    new Response("invalid json"), Response.json({}), Response.json({ success: true }), Response.json({ success: true, signedOrder: {} }),
    Response.json({ success: "true", signedOrder: createV2Order(56, "0xhash") }),
    Response.json({ success: true, signedOrder: { ...createV2Order(56, "0xhash"), hash: undefined } }),
  ])("classifies malformed accepted responses without retrying", async response => {
    silenceErrors();
    mockResponse(response);
    await expect(submit()).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 200 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns the normalized accepted order without changing its identity", async () => {
    mockResponse(Response.json({ success: true, signedOrder: createV2Order(56, "0xaccepted") }));
    await expect(submit()).resolves.toMatchObject({ id: "0xaccepted", chainId: 56 });
  });

  it("preserves transport AbortError identity during submission and configuration", async () => {
    silenceErrors();
    const abort = new DOMException("Request aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn(async () => { throw abort; }));
    await expect(submit()).rejects.toBe(abort);
    await expect(fetchRePermitData(Partners.Thena, 56)).rejects.toBe(abort);
  });

  it("retains configuration transport causes", async () => {
    const cause = new TypeError("Offline");
    vi.stubGlobal("fetch", vi.fn(async () => { throw cause; }));
    await expect(fetchRePermitData(Partners.Thena, 56)).rejects.toMatchObject({ code: "CONFIGURATION_FAILED", cause, message: cause.message });
  });

  it("retains configuration HTTP and service codes", async () => {
    mockResponse(Response.json({ code: "UNSUPPORTED", message: "Unsupported partner/chain" }, { status: 400 }));
    await expect(fetchRePermitData(Partners.Thena, 56)).rejects.toMatchObject({ code: "CONFIGURATION_FAILED", status: 400, serviceCode: "UNSUPPORTED" });
  });

  it("retains malformed configuration response causes", async () => {
    mockResponse(new Response("not json"));
    await expect(fetchRePermitData(Partners.Thena, 56)).rejects.toMatchObject({ code: "CONFIGURATION_FAILED", status: 200, cause: expect.any(SyntaxError) });
  });
});

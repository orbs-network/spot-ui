import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createClient, type ClientGetQuoteParams, type Eip712TypedData, type SpotClient } from "../src/lib/client";
import { createAnalytics } from "../src/lib/analytics";
import { MAX_UINT_256 } from "../src/lib/evm-constants";
import { SpotError } from "../src/lib/errors";
import { fetchRePermitData } from "../src/lib/fetch-repermit-data";
import { calculateOrder } from "../src/lib/order-form/calculate-order-form";
import { buildV2Order, getOrder } from "../src/lib/orders/v2-orders";
import { fetchQuote, type SwapQuote, type SwapQuoteParams } from "../src/lib/quote";
import { submitOrder } from "../src/lib/submit-order";
import { getSwapSlippage, type SwapSlippage } from "../src/lib/swap-slippage";
import { getTokenUsd, type GetTokenUsdParams } from "../src/lib/token-usd";
import { OrderStatus, OrderType, Partners, type Address, type Hex, type RePermitData, type RePermitOrder } from "../src/lib/types";

vi.mock("../src/lib/fetch-repermit-data", () => ({ fetchRePermitData: vi.fn() }));
vi.mock("../src/lib/submit-order", () => ({ submitOrder: vi.fn() }));
vi.mock("../src/lib/orders/v2-orders", async importOriginal => ({
  ...await importOriginal<typeof import("../src/lib/orders/v2-orders")>(), getOrder: vi.fn(),
}));
vi.mock("../src/lib/quote", async importOriginal => ({
  ...await importOriginal<typeof import("../src/lib/quote")>(), fetchQuote: vi.fn(),
}));

const account = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const inputTokenAddress = "0x1111111111111111111111111111111111111111";
const outputTokenAddress = "0x2222222222222222222222222222222222222222";
const spender = "0x3333333333333333333333333333333333333333";
const adapter = "0x4444444444444444444444444444444444444444";
const otherAdapter = "0x5555555555555555555555555555555555555555";
const signature: Hex = `0x${"aB".repeat(64)}00`;
const initialTime = new Date("2030-01-01T00:00:00Z").getTime();
const apiUrl = "https://manual-orders.example/v2";

const configuration = (partner = Partners.Quick, chainId = 137): RePermitData => ({
  domain: { name: "RePermit", version: "1", chainId, verifyingContract: spender },
  primaryType: "Order",
  types: { Order: [{ name: "nonce", type: "uint256" }] },
  order: {
    permitted: { token: inputTokenAddress, amount: "0" }, spender, nonce: "0", deadline: "0",
    witness: {
      reactor: spender, executor: spender,
      exchange: { adapter: partner === Partners.Quick ? adapter : otherAdapter, ref: adapter, share: 0, data: "0x" },
      swapper: account, nonce: "0", deadline: "0", chainid: chainId,
      exclusivity: 0, epoch: 0, slippage: 0, freshness: 0,
      input: { token: inputTokenAddress, amount: "0", maxAmount: "0" },
      output: { token: outputTokenAddress, limit: "0", recipient: account },
    },
  },
});

const quote = (): SwapQuote => ({
  request: {
    chainId: 137, partner: Partners.Quick, inToken: inputTokenAddress,
    outToken: outputTokenAddress, inAmount: "10", user: account, slippage: 0.5,
  },
  receivedAt: Date.now(), amountOut: "20", netAmountOut: "20", minimumAmountOut: "18", feeAmount: "0",
});

const quoteFields = {
  inToken: inputTokenAddress, outToken: outputTokenAddress, user: account, slippage: 0.5,
};
const outputQuotePayload = () => ({
  amountIn: "13", amountOut: "22", netAmountOut: "22", minimumAmountOut: "20", feeAmount: "0",
  quoteMode: "exactOut", requestedAmountOut: "20",
});

const form = () => calculateOrder({
  orderType: OrderType.LIMIT, inputTokenDecimals: 0, outputTokenDecimals: 0,
  quotedOutputAmountRaw: "20", inputBalanceRaw: "100",
  inputTokenUsdPrice: "1", outputTokenUsdPrice: "1", minTradeSizeUsd: 1, priceProtectionPercent: 5,
  userInput: { inputAmountUi: "10", limitPriceUi: "2", isMarketOrder: false },
});

const orderParams = () => ({ form: form(), account, inputTokenAddress, outputTokenAddress });
const client = () => createClient(Partners.Quick, 137, { apiUrl, disableAnalytics: true });
const prepare = (spot: SpotClient, kind: "order" | "swap") => kind === "order"
  ? spot.prepareOrder(orderParams())
  : spot.prepareSwap({ quote: quote(), account });

const acceptedOrder = (order: RePermitOrder) => buildV2Order({
  hash: `0xaccepted-${order.nonce}`, order, signature, timestamp: new Date().toISOString(),
  metadata: {
    expectedChunks: 1, lastPriceCheck: "", nextEligibleTime: "", status: "pending", description: "",
    displayOnlyInputTokenPriceUSD: "", repermitDigest: "0xdigest",
  },
});

describe("client manual signing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(initialTime);
    vi.resetAllMocks();
    vi.mocked(fetchRePermitData).mockImplementation(async (partner, chainId) => configuration(partner, chainId));
    vi.mocked(fetchQuote).mockImplementation(async () => quote());
    vi.mocked(submitOrder).mockImplementation(async order => acceptedOrder(order));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("exposes one client flow for preparing and submitting signed orders", async () => {
    const spot = await client();
    expect(spot).not.toHaveProperty("createOrderExecution");
    expect(spot).not.toHaveProperty("createSwapExecution");
    expect(spot).not.toHaveProperty("getSwapSlippage");
    expect(spot).not.toHaveProperty("getTokenUsd");
    expectTypeOf<Extract<keyof SpotClient, "createOrderExecution" | "createSwapExecution">>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof SpotClient, "getSwapSlippage" | "getTokenUsd">>().toEqualTypeOf<never>();
    expect(spot.prepareOrder).toBeTypeOf("function");
    expect(spot.prepareSwap).toBeTypeOf("function");
    expect(spot.submitOrder).toBeTypeOf("function");
    expect(spot.submitSwap).toBeTypeOf("function");
  });

  it.each([
    { slippage: 0.5, expectedBps: 50 }, { slippage: 0, expectedBps: 0 },
  ])("makes one exact-input quote request with $slippage percent DEX slippage", async ({ slippage, expectedBps }) => {
    const actual = await vi.importActual<typeof import("../src/lib/quote")>("../src/lib/quote");
    vi.mocked(fetchQuote).mockImplementation(actual.fetchQuote);
    const network = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      amountOut: "20", netAmountOut: "20", minimumAmountOut: "18", feeAmount: "0",
    }));
    vi.stubGlobal("fetch", network);
    const spot = await client();

    const quoted = await spot.getQuote({
      inToken: inputTokenAddress, outToken: outputTokenAddress, inAmount: "10", user: account, slippage,
    });

    expect(network).toHaveBeenCalledOnce();
    const body = JSON.parse(String(network.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ inAmount: "10", slippage: expectedBps });
    expect(body).not.toHaveProperty("outAmount");
    expect(body).not.toHaveProperty("dexMinAmountOut");
    expect(quoted.request.inAmount).toBe("10");
    expect(quoted.request.slippage).toBe(slippage);
    expect(quoted.minimumAmountOut).toBe("18");
  });

  it("requests an output target once and signs only the server-resolved input and minimum", async () => {
    const actual = await vi.importActual<typeof import("../src/lib/quote")>("../src/lib/quote");
    vi.mocked(fetchQuote).mockImplementation(actual.fetchQuote);
    const network = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(outputQuotePayload()));
    vi.stubGlobal("fetch", network);
    const spot = await client();

    const quoted = await spot.getQuote({ ...quoteFields, outAmount: "20" });
    const prepared = await spot.prepareSwap({ quote: quoted, account });

    expect(network).toHaveBeenCalledOnce();
    expect(JSON.parse(String(network.mock.calls[0]?.[1]?.body))).toEqual({
      inToken: inputTokenAddress, outToken: outputTokenAddress, outAmount: "20", user: account, slippage: 50,
    });
    expect(quoted.request).toMatchObject({ inAmount: "13", dexMinAmountOut: "-1" });
    expect(quoted.request).not.toHaveProperty("outAmount");
    expect(quoted.requestedOutAmount).toBe("20");
    expect(Object.isFrozen(quoted.request)).toBe(true);
    expect(prepared.approvalRequest.amount).toBe("13");
    expect(prepared.order.witness.input.amount).toBe("13");
    expect(prepared.order.witness.output.limit).toBe("20");
    expect(prepared.order.witness.slippage).toBe(500);
    expect(prepared.signingRequest.typedData.message).toEqual(prepared.order);
    expect(prepared.quote.requestedOutAmount).toBe("20");
  });

  it.each([
    {}, { inAmount: "10", outAmount: "20" },
  ])("rejects requests without exactly one selected amount before HTTP (%j)", async amounts => {
    const actual = await vi.importActual<typeof import("../src/lib/quote")>("../src/lib/quote");
    vi.mocked(fetchQuote).mockImplementation(actual.fetchQuote);
    const network = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", network);
    const spot = await client();

    await expect(actual.getQuote({ ...quoteFields, ...amounts, chainId: 137, partner: Partners.Quick, apiUrl } as unknown as SwapQuoteParams))
      .rejects.toMatchObject({ kind: "invalid-request" });
    await expect(spot.getQuote({ ...quoteFields, ...amounts } as unknown as ClientGetQuoteParams))
      .rejects.toMatchObject({ kind: "invalid-request" });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    { outAmount: "0" }, { outAmount: "-1" }, { outAmount: "1.5" },
    { outAmount: (BigInt(MAX_UINT_256) + BigInt(1)).toString() },
    { inAmount: "0" }, { inAmount: (BigInt(MAX_UINT_256) + BigInt(1)).toString() },
    { outAmount: "20", dexMinAmountOut: "0" }, { outAmount: "20", dexMinAmountOut: "10" },
  ])("rejects invalid quote amounts or ambiguous output minima before HTTP (%j)", async amounts => {
    const actual = await vi.importActual<typeof import("../src/lib/quote")>("../src/lib/quote");
    vi.mocked(fetchQuote).mockImplementation(actual.fetchQuote);
    const network = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", network);
    const spot = await client();

    await expect(spot.getQuote({ ...quoteFields, ...amounts } as unknown as ClientGetQuoteParams))
      .rejects.toMatchObject({ kind: "invalid-request" });

    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    { amountIn: undefined }, { amountIn: "0" }, { amountIn: "-1" }, { amountIn: "1.5" },
    { amountIn: (BigInt(MAX_UINT_256) + BigInt(1)).toString() },
    { requestedAmountOut: "21" }, { quoteMode: "exactIn" },
    { minimumAmountOut: "19" }, { netAmountOut: "19", minimumAmountOut: "20" },
    { amountOut: "0" }, { feeAmount: (BigInt(MAX_UINT_256) + BigInt(1)).toString() },
    { netAmountOut: (BigInt(MAX_UINT_256) + BigInt(1)).toString() },
  ])("rejects malformed or unsafe output quote responses (%j)", async invalid => {
    const actual = await vi.importActual<typeof import("../src/lib/quote")>("../src/lib/quote");
    vi.mocked(fetchQuote).mockImplementation(actual.fetchQuote);
    const network = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ ...outputQuotePayload(), ...invalid }));
    vi.stubGlobal("fetch", network);
    const spot = await client();

    await expect(spot.getQuote({ ...quoteFields, outAmount: "20" })).rejects.toMatchObject({ kind: "invalid-response" });

    expect(network).toHaveBeenCalledOnce();
  });

  it("rejects an input response whose echoed spending differs from the request", async () => {
    const actual = await vi.importActual<typeof import("../src/lib/quote")>("../src/lib/quote");
    vi.mocked(fetchQuote).mockImplementation(actual.fetchQuote);
    const network = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      ...outputQuotePayload(), amountIn: "11", quoteMode: "exactIn", requestedAmountOut: undefined,
    }));
    vi.stubGlobal("fetch", network);
    const spot = await client();

    await expect(spot.getQuote({ ...quoteFields, inAmount: "10" })).rejects.toMatchObject({ kind: "invalid-response" });

    expect(network).toHaveBeenCalledOnce();
  });

  it.each([
    { threshold: "18", accepted: true }, { threshold: "19", accepted: false },
  ])("checks local DEX minimum $threshold without sending it as an output target", async ({ threshold, accepted }) => {
    const actual = await vi.importActual<typeof import("../src/lib/quote")>("../src/lib/quote");
    vi.mocked(fetchQuote).mockImplementation(actual.fetchQuote);
    const network = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      amountIn: "010", amountOut: "20", netAmountOut: "20", minimumAmountOut: "18", feeAmount: "0", quoteMode: "exactIn",
    }));
    vi.stubGlobal("fetch", network);
    const spot = await client();

    const result = spot.getQuote({ ...quoteFields, inAmount: "10", dexMinAmountOut: threshold });
    if (accepted) {
      await expect(result).resolves.toMatchObject({ minimumAmountOut: "18", request: { inAmount: "10", dexMinAmountOut: threshold } });
    } else {
      await expect(result).rejects.toMatchObject({ kind: "no-quote" });
    }

    expect(network).toHaveBeenCalledOnce();
    const body = JSON.parse(String(network.mock.calls[0]?.[1]?.body));
    expect(body.inAmount).toBe("10");
    expect(body).not.toHaveProperty("outAmount");
    expect(body).not.toHaveProperty("dexMinAmountOut");
  });

  it("reports server-resolved spending with the original output mode and target", async () => {
    const actual = await vi.importActual<typeof import("../src/lib/quote")>("../src/lib/quote");
    const network = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(outputQuotePayload()));
    vi.stubGlobal("fetch", network);
    const reporter = createAnalytics({}, { disableAnalytics: true });
    const requested = vi.spyOn(reporter, "onQuoteRequest");
    const succeeded = vi.spyOn(reporter, "onQuoteSuccess");

    await actual.fetchQuote({ ...quoteFields, outAmount: "20", chainId: 137, partner: Partners.Quick, apiUrl }, reporter);

    expect(requested).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      quoteMode: "exactOut", requestedOutputAmountRaw: "20", inputAmountRaw: undefined,
    }));
    expect(succeeded).toHaveBeenCalledExactlyOnceWith({ context: expect.objectContaining({
      quoteMode: "exactOut", requestedOutputAmountRaw: "20", inputAmountRaw: "13",
    }) });
    expect(network).toHaveBeenCalledOnce();
  });

  it.each(["order", "swap"] as const)("prepares, signs inline, and submits a %s without wallet interactions", async kind => {
    const spot = await client();
    const prepared = await prepare(spot, kind);
    expect(spot.spenderAddress).toBe(spender);
    expect(prepared.approvalRequest).toEqual({
      tokenAddress: inputTokenAddress, spenderAddress: spot.spenderAddress, amount: "10", approvalAmount: MAX_UINT_256,
    });
    expect(prepared.signingRequest.signerAddress).toBe(account);
    expect(prepared.signingRequest.typedData.message).toEqual(prepared.order);
    expect(prepared.signingRequest.typedData.domain).toEqual(configuration().domain);
    expect(prepared.order.witness.swapper).toBe(account);
    expect(prepared.order.witness.output.recipient).toBe(account);
    expect(submitOrder).not.toHaveBeenCalled();

    const signTypedData = vi.fn<(request: Eip712TypedData & { account: Address }) => Promise<Hex>>().mockResolvedValue(signature);
    const signed = await signTypedData({ ...prepared.signingRequest.typedData, account: prepared.signingRequest.signerAddress });
    const options = { signal: new AbortController().signal };
    const accepted = await (kind === "swap"
      ? spot.submitSwap(prepared.order, signed, options)
      : spot.submitOrder(prepared.order, signed, options));

    expect(signTypedData).toHaveBeenCalledExactlyOnceWith({ ...prepared.signingRequest.typedData, account });
    expect(submitOrder).toHaveBeenCalledExactlyOnceWith(prepared.order, signature, expect.any(Object), options, apiUrl);
    expect(accepted.status).toBe(OrderStatus.Open);
    expect(accepted.maker).toBe(account);
    expect(getOrder).not.toHaveBeenCalled();
  });

  it("validates direct advanced preparation before returning signing values", async () => {
    const spot = await client();
    const valid = orderParams();
    const invalidAmount = (amount: string) => ({
      ...valid,
      form: {
        ...valid.form,
        inputAmount: { ...valid.form.inputAmount, raw: amount },
        values: { ...valid.form.values, inputAmount: amount },
      },
    });
    const invalid = [
      { ...valid, form: { ...valid.form, canSubmit: false } },
      { ...valid, account: "not-an-address" },
      { ...valid, inputTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" },
      { ...valid, outputTokenAddress: "invalid-token" },
      { ...valid, form: { ...valid.form, values: { ...valid.form.values, inputAmount: "999" } } },
      { ...valid, form: { ...valid.form, values: { ...valid.form.values, slippageBps: 10001 } } },
      invalidAmount("0"), invalidAmount("1.5"),
    ];
    for (const params of invalid) expect(() => spot.prepareOrder(params)).toThrow(SpotError);
    expect(submitOrder).not.toHaveBeenCalled();
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it.each([0.5, 1, 2.345, 0])("keeps signed oracle protection at 500 basis points with %s percent DEX slippage", async slippage => {
    const spot = await client();
    const original = quote();
    const reviewed = { ...original, request: { ...original.request, slippage } };

    const prepared = await spot.prepareSwap({ quote: reviewed, account });

    expect(prepared.order.witness.slippage).toBe(500);
    expect(prepared.signingRequest.typedData.message.witness.slippage).toBe(500);
    expect(prepared.quote.request.slippage).toBe(slippage);
    expect(prepared.quote.minimumAmountOut).toBe(reviewed.minimumAmountOut);
    expect(prepared.values.minimumOutputAmountRaw).toBe(reviewed.minimumAmountOut);
    expect(prepared.order.witness.output.limit).toBe(reviewed.minimumAmountOut);
    expect(prepared.signingRequest.typedData.message.witness.output.limit).toBe(reviewed.minimumAmountOut);
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("refreshes a stale reviewed swap before returning the exact payload to sign", async () => {
    const spot = await client();
    const original = quote();
    const reviewed = {
      ...original, request: { ...original.request, slippage: 2.345 }, receivedAt: original.receivedAt - 20_001,
    };
    const fresh = {
      ...quote(), request: { ...reviewed.request }, amountOut: "24", netAmountOut: "24", minimumAmountOut: "22",
    };
    vi.mocked(fetchQuote).mockResolvedValue(fresh);

    const prepared = await spot.prepareSwap({ quote: reviewed, account });

    expect(fetchQuote).toHaveBeenCalledOnce();
    expect(fetchQuote).toHaveBeenCalledWith(expect.objectContaining({ slippage: 2.345 }), expect.any(Object));
    expect(prepared.quote.minimumAmountOut).toBe("22");
    expect(prepared.order.witness.output.limit).toBe("22");
    expect(prepared.order.witness.slippage).toBe(500);
    expect(prepared.signingRequest.typedData.message.witness.slippage).toBe(500);
    expect(prepared.quote.request.slippage).toBe(2.345);
    expect(prepared.signingRequest.typedData.message).toEqual(prepared.order);
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each([
    { freshMinimum: "21", rejected: false }, { freshMinimum: "19", rejected: true },
  ])("refreshes an output quote at its resolved fixed input (fresh minimum $freshMinimum)", async ({ freshMinimum, rejected }) => {
    const actual = await vi.importActual<typeof import("../src/lib/quote")>("../src/lib/quote");
    vi.mocked(fetchQuote).mockImplementation(actual.fetchQuote);
    const network = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(outputQuotePayload()))
      .mockResolvedValueOnce(Response.json({
        ...outputQuotePayload(), amountIn: "13", quoteMode: "exactIn", requestedAmountOut: undefined,
        minimumAmountOut: freshMinimum,
      }));
    vi.stubGlobal("fetch", network);
    const spot = await client();
    const reviewed = await spot.getQuote({ ...quoteFields, outAmount: "20" });
    vi.setSystemTime(initialTime + 20_001);

    const preparing = spot.prepareSwap({ quote: reviewed, account });
    if (rejected) {
      await expect(preparing).rejects.toMatchObject({ code: "QUOTE_MINIMUM_DECREASED" });
    } else {
      const prepared = await preparing;
      expect(prepared.quote).toMatchObject({ requestedOutAmount: "20", request: { inAmount: "13" }, minimumAmountOut: "21" });
      expect(prepared.order.witness.input.amount).toBe("13");
      expect(prepared.order.witness.output.limit).toBe("21");
      expect(prepared.order.witness.slippage).toBe(500);
    }

    expect(network).toHaveBeenCalledTimes(2);
    const refresh = JSON.parse(String(network.mock.calls[1]?.[1]?.body));
    expect(refresh.inAmount).toBe("13");
    expect(refresh).not.toHaveProperty("outAmount");
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("rejects a decreased minimum during direct swap preparation", async () => {
    const spot = await client();
    const original = quote();
    const reviewed = { ...original, receivedAt: original.receivedAt - 20_001 };
    vi.mocked(fetchQuote).mockResolvedValue({ ...quote(), minimumAmountOut: "17" });

    await expect(spot.prepareSwap({ quote: reviewed, account })).rejects.toMatchObject({ code: "QUOTE_MINIMUM_DECREASED" });
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each([
    [Partners.Quick, 56], [Partners.Pancake, 137],
  ] as const)("rejects direct submission through a different client (%s, %s)", async (partner, chainId) => {
    const original = await client();
    const prepared = original.prepareOrder(orderParams());
    const other = await createClient(partner, chainId, { disableAnalytics: true });

    await expect(other.submitOrder(prepared.order, signature)).rejects.toBeInstanceOf(SpotError);
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each(["order", "swap"] as const)("rejects an expired manually signed %s before submission", async kind => {
    const spot = await client();
    const prepared = await prepare(spot, kind);
    vi.setSystemTime(Number(prepared.order.deadline) * 1000 + 1);

    const submitting = kind === "swap"
      ? spot.submitSwap(prepared.order, signature)
      : spot.submitOrder(prepared.order, signature);
    await expect(submitting).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it.each(["order", "swap"] as const)("rejects a pre-aborted direct %s submission before posting", async kind => {
    const spot = await client();
    const prepared = await prepare(spot, kind);
    const controller = new AbortController();
    const reason = new Error("Cancelled before direct submission");
    controller.abort(reason);

    const submitting = kind === "swap"
      ? spot.submitSwap(prepared.order, signature, { signal: controller.signal })
      : spot.submitOrder(prepared.order, signature, { signal: controller.signal });
    await expect(submitting).rejects.toBe(reason);
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("detaches advanced preparation from the form and future client signing data", async () => {
    const spot = await client();
    const params = orderParams();
    const prepared = spot.prepareOrder(params);
    const originalForm = structuredClone(params.form);
    params.form.inputAmount.raw = "999";
    params.form.values.inputAmount = "999";
    expect(prepared.form).toEqual(originalForm);
    expect(prepared.order.permitted.amount).toBe("10");

    Reflect.set(prepared.signingRequest.typedData.domain, "verifyingContract", outputTokenAddress);
    Reflect.set(prepared.signingRequest.typedData.types, "Order", [{ name: "changed", type: "address" }]);
    Reflect.set(prepared.order.witness.exchange, "adapter", outputTokenAddress);
    const next = spot.prepareOrder(orderParams());
    expect(next.signingRequest.typedData.domain).toEqual(configuration().domain);
    expect(next.signingRequest.typedData.types).toEqual(configuration().types);
    expect(next.order.witness.exchange.adapter).toBe(adapter);
    expect(spot.rePermitData.domain.verifyingContract).toBe(spender);
  });

  it("detaches swap preparation from the reviewed quote and future client signing data", async () => {
    const spot = await client();
    const reviewed = quote();
    const prepared = await spot.prepareSwap({ quote: reviewed, account });
    Reflect.set(reviewed.request, "inAmount", "999");
    reviewed.minimumAmountOut = "1";
    expect(prepared.quote.request.inAmount).toBe("10");
    expect(prepared.quote.minimumAmountOut).toBe("18");
    expect(prepared.order.permitted.amount).toBe("10");

    Reflect.set(prepared.signingRequest.typedData.domain, "verifyingContract", outputTokenAddress);
    Reflect.set(prepared.signingRequest.typedData.types, "Order", [{ name: "changed", type: "address" }]);
    const next = await spot.prepareSwap({ quote: quote(), account });
    expect(next.signingRequest.typedData.domain).toEqual(configuration().domain);
    expect(next.signingRequest.typedData.types).toEqual(configuration().types);
    expect(next.order.witness.output.limit).toBe("18");
  });
});

describe("synchronous swap slippage policy", () => {
  const params = { amountUsd: "100", slippage: 0.5 };
  let network: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

  beforeEach(() => {
    network = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", network);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns a synchronous result without network access or mutating its inputs", () => {
    const input = Object.freeze({ ...params });

    const policy = getSwapSlippage(input);

    expectTypeOf<typeof policy>().toEqualTypeOf<SwapSlippage>();
    expect(policy).not.toBeInstanceOf(Promise);
    expect(policy).toEqual({ slippagePercent: 1, slippageBps: 100, amountUsd: "100" });
    expect(input).toEqual(params);
    expect(network).not.toHaveBeenCalled();
  });

  it.each([0, 0.004])("throws synchronously when slippage rounds to zero (%s)", slippage => {
    expect(() => getSwapSlippage({ ...params, slippage }))
      .toThrowError(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
    expect(network).not.toHaveBeenCalled();
  });

  it("rounds the baseline before applying the automatic USD policy", () => {
    expect(getSwapSlippage({ ...params, slippage: 0.005, amountUsd: undefined }))
      .toEqual({ slippagePercent: 0.01, slippageBps: 1, amountUsd: undefined });
    expect(getSwapSlippage({ ...params, slippage: 0.005 }))
      .toEqual({ slippagePercent: 1, slippageBps: 100, amountUsd: "100" });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([undefined, "", ".", "0", "0.0", "-1", "invalid", "Infinity"])("retains the baseline for unusable USD totals (%s)", amountUsd => {
    expect(getSwapSlippage({ ...params, amountUsd }))
      .toEqual({ slippagePercent: 0.5, slippageBps: 50, amountUsd: undefined });
    expect(network).not.toHaveBeenCalled();
  });

  it("preserves the exact $100 boundary and never lowers a larger baseline", () => {
    expect(getSwapSlippage({ ...params, amountUsd: "100" }))
      .toEqual({ slippagePercent: 1, slippageBps: 100, amountUsd: "100" });
    expect(getSwapSlippage({ ...params, amountUsd: "100.000000000000000001" }))
      .toEqual({ slippagePercent: 0.5, slippageBps: 50, amountUsd: "100.000000000000000001" });
    expect(getSwapSlippage({ ...params, amountUsd: "0.0000000000000000001" }))
      .toEqual({ slippagePercent: 1, slippageBps: 100, amountUsd: "0.0000000000000000001" });
    expect(getSwapSlippage({ ...params, slippage: 2 }))
      .toEqual({ slippagePercent: 2, slippageBps: 200, amountUsd: "100" });
    expect(network).not.toHaveBeenCalled();
  });

});

describe("shared token USD cache", () => {
  const params = { tokenAddress: inputTokenAddress, chainId: 137 };
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(accept => { resolve = accept; });
    return { promise, resolve };
  };
  const priceResponse = (priceUsd = "2000000000000000000") => Response.json({ token: inputTokenAddress, priceUsd });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(initialTime);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("expires a successful price exactly 30 seconds after its response", async () => {
    const response = deferred<Response>();
    const network = vi.fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(priceResponse("3000000000000000000"));
    vi.stubGlobal("fetch", network);
    const request = { ...params, chainId: 137 };
    const first = getTokenUsd(request);

    await vi.advanceTimersByTimeAsync(20_000);
    response.resolve(priceResponse());
    await expect(first).resolves.toBe("2");
    await vi.advanceTimersByTimeAsync(29_999);
    await expect(getTokenUsd(request)).resolves.toBe("2");
    expect(network).toHaveBeenCalledOnce();
    expect(network.mock.calls[0]?.[0]).toBe(`https://order-sink-v2.orbs.network/price/${inputTokenAddress}?chainId=137`);
    expectTypeOf<Extract<keyof GetTokenUsdParams, "apiUrl" | "cacheMillis">>().toEqualTypeOf<never>();

    await vi.advanceTimersByTimeAsync(1);
    await expect(getTokenUsd(request)).resolves.toBe("3");
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("uses a caller's custom cache lifetime at its exact boundary", async () => {
    const network = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(priceResponse())
      .mockResolvedValueOnce(priceResponse("3000000000000000000"));
    vi.stubGlobal("fetch", network);
    const request = { ...params, chainId: 42161, cacheSeconds: 1 };

    await expect(getTokenUsd(request)).resolves.toBe("2");
    await vi.advanceTimersByTimeAsync(999);
    await expect(getTokenUsd(request)).resolves.toBe("2");
    expect(network).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await expect(getTokenUsd(request)).resolves.toBe("3");
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("shares pending work with zero caching but fetches again after completion", async () => {
    const response = deferred<Response>();
    const network = vi.fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(priceResponse("3000000000000000000"));
    vi.stubGlobal("fetch", network);
    const request = { ...params, chainId: 10, cacheSeconds: 0 };
    const first = getTokenUsd(request);
    const shared = getTokenUsd(request);

    expect(network).toHaveBeenCalledOnce();
    response.resolve(priceResponse());
    await expect(Promise.all([first, shared])).resolves.toEqual(["2", "2"]);
    await expect(getTokenUsd(request)).resolves.toBe("3");
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("does not give a short-lived caller an older value retained by a longer caller", async () => {
    const network = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(priceResponse())
      .mockResolvedValueOnce(priceResponse("3000000000000000000"));
    vi.stubGlobal("fetch", network);
    const request = { ...params, chainId: 8453 };

    await expect(getTokenUsd({ ...request, cacheSeconds: 10 })).resolves.toBe("2");
    await vi.advanceTimersByTimeAsync(999);
    await expect(getTokenUsd({ ...request, cacheSeconds: 1 })).resolves.toBe("2");
    expect(network).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2);
    await expect(getTokenUsd({ ...request, cacheSeconds: 1 })).resolves.toBe("3");
    await expect(getTokenUsd({ ...request, cacheSeconds: 10 })).resolves.toBe("3");
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("lets a longer-lived caller extend retention without resetting the response age", async () => {
    const network = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(priceResponse())
      .mockResolvedValueOnce(priceResponse("3000000000000000000"));
    vi.stubGlobal("fetch", network);
    const request = { ...params, chainId: 43114 };

    await expect(getTokenUsd({ ...request, cacheSeconds: 1 })).resolves.toBe("2");
    await vi.advanceTimersByTimeAsync(500);
    await expect(getTokenUsd({ ...request, cacheSeconds: 5 })).resolves.toBe("2");
    await vi.advanceTimersByTimeAsync(4_499);
    await expect(getTokenUsd({ ...request, cacheSeconds: 5 })).resolves.toBe("2");
    expect(network).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await expect(getTokenUsd({ ...request, cacheSeconds: 5 })).resolves.toBe("3");
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("shares mixed-duration pending callers and starts retention when their response arrives", async () => {
    const response = deferred<Response>();
    const network = vi.fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(priceResponse("3000000000000000000"));
    vi.stubGlobal("fetch", network);
    const request = { ...params, chainId: 100 };
    const short = getTokenUsd({ ...request, cacheSeconds: 1 });

    await vi.advanceTimersByTimeAsync(2_000);
    const long = getTokenUsd({ ...request, cacheSeconds: 5 });
    expect(network).toHaveBeenCalledOnce();
    response.resolve(priceResponse());
    await expect(Promise.all([short, long])).resolves.toEqual(["2", "2"]);
    await vi.advanceTimersByTimeAsync(4_999);
    await expect(getTokenUsd({ ...request, cacheSeconds: 5 })).resolves.toBe("2");
    expect(network).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await expect(getTokenUsd({ ...request, cacheSeconds: 5 })).resolves.toBe("3");
    expect(network).toHaveBeenCalledTimes(2);
  });

  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects an invalid cache lifetime before fetching (%s)", async cacheSeconds => {
    const network = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", network);

    await expect(getTokenUsd({ ...params, cacheSeconds })).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });

    expect(network).not.toHaveBeenCalled();
  });

  it("retains a refreshed pending entry when another key fills the LRU cache", async () => {
    const network = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => priceResponse());
    vi.stubGlobal("fetch", network);
    const firstChain = 30_000;
    for (let offset = 0; offset < 128; offset++) {
      await getTokenUsd({ ...params, chainId: firstChain + offset, cacheSeconds: 60 });
    }
    expect(network).toHaveBeenCalledTimes(128);

    const response = deferred<Response>();
    network.mockReturnValueOnce(response.promise);
    const request = { ...params, chainId: firstChain, cacheSeconds: 0 };
    const refreshed = getTokenUsd(request);
    await getTokenUsd({ ...params, chainId: firstChain + 128, cacheSeconds: 60 });
    const shared = getTokenUsd(request);

    expect(network).toHaveBeenCalledTimes(130);
    response.resolve(priceResponse("3000000000000000000"));
    await expect(Promise.all([refreshed, shared])).resolves.toEqual(["3", "3"]);
  });

  it("propagates cancellation without cancelling shared pricing for another caller", async () => {
    const response = deferred<Response>();
    const network = vi.fn<typeof globalThis.fetch>().mockReturnValue(response.promise);
    vi.stubGlobal("fetch", network);
    const request = { ...params, chainId: 56 };
    const controller = new AbortController();
    const reason = new Error("Stop this price wait");
    const cancelled = getTokenUsd({ ...request, signal: controller.signal });
    const rejected = expect(cancelled).rejects.toBe(reason);
    const shared = getTokenUsd(request);

    controller.abort(reason);
    await rejected;
    response.resolve(priceResponse());

    await expect(shared).resolves.toBe("2");
    expect(network).toHaveBeenCalledOnce();
    expect(network.mock.calls[0]?.[1]?.signal).toBeUndefined();
  });

  it("retries pricing immediately after a failed lookup", async () => {
    const network = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("Price backend unavailable"))
      .mockResolvedValueOnce(priceResponse());
    vi.stubGlobal("fetch", network);
    const request = { ...params, chainId: 1 };

    await expect(getTokenUsd(request)).rejects.toMatchObject({ code: "PRICE_LOOKUP_FAILED" });
    await expect(getTokenUsd(request)).resolves.toBe("2");
    expect(network).toHaveBeenCalledTimes(2);
  });
});

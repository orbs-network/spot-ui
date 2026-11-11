import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createClient, type Eip712TypedData, type SpotClient } from "../src/lib/client";
import { MAX_UINT_256 } from "../src/lib/evm-constants";
import { SpotError } from "../src/lib/errors";
import { fetchRePermitData } from "../src/lib/fetch-repermit-data";
import { calculateOrder } from "../src/lib/order-form/calculate-order-form";
import { buildV2Order, getOrder } from "../src/lib/orders/v2-orders";
import { fetchQuote, type SwapQuote } from "../src/lib/quote";
import { submitOrder } from "../src/lib/submit-order";
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

const form = () => calculateOrder({
  orderType: OrderType.LIMIT, inputTokenDecimals: 0, outputTokenDecimals: 0,
  quotedOutputAmountRaw: "20", inputBalanceRaw: "100",
  inputTokenUsdPrice: "1", outputTokenUsdPrice: "1", minTradeSizeUsd: 1, priceProtectionPercent: 5,
  userInput: { inputAmountUi: "10", limitPriceUi: "2" },
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
  afterEach(() => { vi.useRealTimers(); });

  it("exposes one client flow for preparing and submitting signed orders", async () => {
    const spot = await client();
    expect(spot).not.toHaveProperty("createOrderExecution");
    expect(spot).not.toHaveProperty("createSwapExecution");
    expectTypeOf<Extract<keyof SpotClient, "createOrderExecution" | "createSwapExecution">>().toEqualTypeOf<never>();
    expect(spot.prepareOrder).toBeTypeOf("function");
    expect(spot.prepareSwap).toBeTypeOf("function");
    expect(spot.submitOrder).toBeTypeOf("function");
    expect(spot.submitSwap).toBeTypeOf("function");
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

  it("refreshes a stale reviewed swap before returning the exact payload to sign", async () => {
    const spot = await client();
    const reviewed = quote();
    reviewed.receivedAt -= 20_001;
    const fresh = { ...quote(), amountOut: "24", netAmountOut: "24", minimumAmountOut: "22" };
    vi.mocked(fetchQuote).mockResolvedValue(fresh);

    const prepared = await spot.prepareSwap({ quote: reviewed, account });

    expect(fetchQuote).toHaveBeenCalledOnce();
    expect(prepared.quote.minimumAmountOut).toBe("22");
    expect(prepared.order.witness.output.limit).toBe("22");
    expect(prepared.signingRequest.typedData.message).toEqual(prepared.order);
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it("rejects a decreased minimum during direct swap preparation", async () => {
    const spot = await client();
    const reviewed = quote();
    reviewed.receivedAt -= 20_001;
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
    reviewed.request.inAmount = "999";
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

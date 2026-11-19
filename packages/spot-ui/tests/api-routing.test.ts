import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, getOrders, Partners, type Hex, type RePermitData, type RePermitOrder } from "../src/index";

const productionApi = "https://order-sink-v2.orbs.network";
const customApi = "https://custom-orders.example/v2";
const account = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const inputToken = "0x1111111111111111111111111111111111111111";
const outputToken = "0x2222222222222222222222222222222222222222";
const spender = "0x3333333333333333333333333333333333333333";
const adapter = "0x4444444444444444444444444444444444444444";
const signature: Hex = `0x${"ab".repeat(64)}00`;
const orderId = `0x${"f".repeat(64)}`;
const quoteParams = { inToken: inputToken, outToken: outputToken, inAmount: "10", user: account, slippage: 0.5 };
const quotePayload = { amountOut: "20", netAmountOut: "20", minimumAmountOut: "18", feeAmount: "0" };

const configuration = (): RePermitData => ({
  domain: { name: "RePermit", version: "1", chainId: 137, verifyingContract: spender },
  primaryType: "Order", types: { Order: [{ name: "nonce", type: "uint256" }] },
  order: {
    permitted: { token: inputToken, amount: "0" }, spender, nonce: "0", deadline: "0",
    witness: {
      reactor: spender, executor: spender, exchange: { adapter, ref: adapter, share: 0, data: "0x" },
      swapper: account, nonce: "0", deadline: "0", chainid: 137,
      exclusivity: 0, epoch: 0, slippage: 0, freshness: 0,
      input: { token: inputToken, amount: "0", maxAmount: "0" },
      output: { token: outputToken, limit: "0", recipient: account },
    },
  },
});

describe("order-service endpoint routing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("uses production configuration and quotes while custom submission and history stay isolated", async () => {
    let submittedOrder: RePermitOrder;
    const signedOrder = () => ({
      hash: orderId, order: submittedOrder, signature, timestamp: new Date().toISOString(),
      metadata: {
        expectedChunks: 1, status: "pending", description: "", lastPriceCheck: "", nextEligibleTime: "",
        displayOnlyInputTokenPriceUSD: "", repermitDigest: "0xdigest",
      },
    });
    const network = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const target = `${url.origin}${url.pathname}`;
      if (target === `${productionApi}/config`) return Response.json(configuration());
      if (target === `${productionApi}/quote`) return Response.json(quotePayload);
      if (target === `${customApi}/orders/new`) {
        submittedOrder = JSON.parse(String(init?.body)).order;
        return Response.json({ success: true, signedOrder: signedOrder() });
      }
      if (target === `${customApi}/orders`) return Response.json({ orders: [signedOrder()] });
      if (target === `${productionApi}/orders` || target === "https://order-sink.orbs.network/orders") {
        return Response.json({ orders: [] });
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal("fetch", network);

    const custom = await createClient(Partners.Quick, 137, { apiUrl: `${customApi}/`, disableAnalytics: true });
    const production = await createClient(Partners.Quick, 137, { disableAnalytics: true });
    expect(custom.apiUrl).toBe(customApi);
    expect(custom.spenderAddress).toBe(production.spenderAddress);
    expect(custom.exchangeAddress).toBe(production.exchangeAddress);

    const reviewed = await custom.getQuote(quoteParams);
    vi.setSystemTime(Date.now() + 20_001);
    const prepared = await custom.prepareSwap({ quote: reviewed, account });
    const accepted = await custom.submitSwap(prepared.order, signature);
    expect(accepted.id).toBe(orderId);
    await expect(custom.getOrder({ orderId })).resolves.toMatchObject({ id: orderId });
    await expect(custom.getOrders({ account })).resolves.toMatchObject({ orders: [{ id: orderId }], legacyLoaded: false });
    await expect(getOrders({ apiUrl: customApi, chainId: 137, exchange: Partners.Quick, swapper: account }))
      .resolves.toMatchObject([{ id: orderId }]);
    await expect(production.getOrders({ account, legacyOrders: false }))
      .resolves.toEqual({ orders: [], legacyLoaded: false });

    const requests = network.mock.calls.map(([input]) => new URL(String(input)));
    expect(requests.map(url => `${url.origin}${url.pathname}`)).toEqual([
      `${productionApi}/config`, `${productionApi}/quote`, `${productionApi}/quote`,
      `${customApi}/orders/new`, `${customApi}/orders`, `${customApi}/orders`, `${customApi}/orders`,
      `${productionApi}/orders`, "https://order-sink.orbs.network/orders",
    ]);
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({ partner: "quick", chain: "137" });
    expect(Object.fromEntries(requests[1]!.searchParams)).toEqual({ chainId: "137", partner: "quick" });
    expect(Object.fromEntries(requests[4]!.searchParams)).toEqual({ hash: orderId, chainId: "137" });
    expect(JSON.parse(String(network.mock.calls[2]?.[1]?.body))).toMatchObject({ inAmount: "10", slippage: 50 });
  });

});

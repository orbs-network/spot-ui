import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createClient, getMinimumOutputAmount, getQuote, OrderStatus, Partners, waitForOrder,
} from "../src";
import { ADDRESS_1, ADDRESS_2, ADDRESS_3, ADDRESS_4, createRePermitData, createV2Order } from "./fixtures";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("QuickSwap-owned router flow", () => {
  it("quotes, prepares, submits the original signature, and tracks the exact intent without a provider", async () => {
    const rawOrder = createV2Order(137, `0x${"12".repeat(32)}`);
    rawOrder.order.deadline = String(Math.floor(Date.now() / 1000) + 900);
    rawOrder.metadata.status = "completed";
    const requests: { url: URL; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      if (url.pathname === "/config") return Response.json(createRePermitData(137));
      if (url.pathname === "/quote") return Response.json({ amountOut: "201", netAmountOut: "200", minimumAmountOut: "199", feeAmount: "1" });
      if (url.pathname === "/orders/new") return Response.json({ success: true, signedOrder: { ...rawOrder, metadata: { ...rawOrder.metadata, status: "pending" } } });
      if (url.pathname === "/orders") return Response.json({ orders: [createV2Order(137, `${rawOrder.hash}ff`), rawOrder] });
      throw new Error(`Unexpected request: ${url}`);
    }));
    const client = await createClient(Partners.Quick, 137, { disableAnalytics: true });
    const quote = await getQuote({ chainId: 137, partner: Partners.Quick, inToken: ADDRESS_2, outToken: ADDRESS_3,
      inAmount: "100", user: ADDRESS_1, slippage: 0.5, dexMinAmountOut: "197" });
    const minimumOutputAmountRaw = getMinimumOutputAmount(quote.netAmountOut, 0.5);
    const prepared = client.prepareSwap({ quote, minimumOutputAmountRaw, swapperAddress: ADDRESS_1 });
    expect(prepared.approvalRequest.spenderAddress).toBe(client.spenderAddress);
    expect(prepared.signingRequest.typedData.message.witness.output.limit).toBe("199");
    const signature = `0x${"ab".repeat(65)}` as const;
    const submitted = await client.submitOrder(prepared.order, signature);
    const body = JSON.parse(String(requests.find(({ url }) => url.pathname === "/orders/new")!.init!.body));
    expect(body).toEqual({ order: prepared.order, signature, status: "pending" });
    const filled = await waitForOrder({ order: submitted });
    expect(filled.status).toBe(OrderStatus.Completed);
    const lookup = requests.find(({ url }) => url.pathname === "/orders")!.url;
    expect(Object.fromEntries(lookup.searchParams)).toEqual({ hash: submitted.id, chainId: "137" });
    expect(client.getCancelOrderRequest(filled)).toMatchObject({ contractAddress: client.spenderAddress, args: [[rawOrder.metadata.repermitDigest]] });
  });

  it.each(["getAccountOrders", "getAccountOrdersResult"] as const)("%s includes current and legacy adapters", async (method) => {
    const config = createRePermitData(137);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      requests.push(url);
      return Response.json(url.pathname === "/config" ? config : { orders: [] });
    }));
    const client = await createClient(Partners.Quick, 137, { disableAnalytics: true });
    await client[method]({ account: ADDRESS_4, legacyOrders: false, getv1orders: false });
    const query = requests.find(url => url.pathname === "/orders")!.searchParams;
    expect(Object.fromEntries(query)).toEqual({ swapper: ADDRESS_4, chainId: "137", exchange: `quickswap,${config.order.witness.exchange.adapter}` });
  });
});

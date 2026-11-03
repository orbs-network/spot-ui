import { afterEach, describe, expect, it, vi } from "vitest";
import response from "./fixtures/relay-quote.json";
import { createClient } from "../src/lib/client";
import { getQuote } from "../src/lib/quote";
import { submitSwap } from "../src/lib/swap";
import { Partners, type Order } from "../src/lib/types";

vi.mock("../src/lib/fetch-repermit-data", () => ({ fetchRePermitData: async () => ({ ...response, order: response.message }) }));

const request = { chainId: 8453, partner: Partners.External, inToken: response.message.permitted.token,
  outToken: response.message.witness.output.token, inAmount: response.message.permitted.amount,
  user: response.message.witness.swapper, slippage: 0.5 };
const relay = () => ({ ...structuredClone(response), message: { ...structuredClone(response.message),
  witness: { ...structuredClone(response.message.witness), slippage: 500 } } });
const mockQuote = (value = relay()) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => value }));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("relay swap order", () => {
  it("keeps the relay typed data and refreshes only start and deadlines", async () => {
    const data = relay();
    mockQuote(data);
    const quote = await getQuote(request);
    expect(quote).toMatchObject({ typedData: { domain: data.domain, types: data.types, primaryType: data.primaryType, message: data.message } });
    const client = await createClient(Partners.External, 8453, { disableAnalytics: true });
    const now = 1_900_000_000_123;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const prepared = client.prepareSwap(quote, request.user);
    const deadline = String(Math.floor((now + 180_000) / 1000));
    expect(prepared.order).toEqual({ ...data.message, deadline, witness: { ...data.message.witness, start: String(Math.floor(now / 1000)), deadline } });
    expect(prepared.signingRequest.typedData).toEqual({ domain: data.domain, types: data.types, primaryType: data.primaryType, message: prepared.order });
    expect(quote.typedData.message).toEqual(data.message);
    expect(prepared.order.witness.slippage).toBe(500);
    expect(prepared.order.witness.output.limit).toBe(data.minimumAmountOut);
  });

  it("requires a quote for the connected signer", async () => {
    mockQuote();
    const quote = await getQuote(request);
    const client = await createClient(Partners.External, 8453, { disableAnalytics: true });
    expect(() => client.prepareSwap(quote, "0x2222222222222222222222222222222222222222")).toThrow();
  });

  it.each([true, false])("signs only a fresh relay minimum that covers review: %s", async improves => {
    mockQuote();
    const quote = await getQuote(request);
    const fresh = relay();
    fresh.minimumAmountOut = String(BigInt(fresh.minimumAmountOut) + (improves ? 1n : -1n));
    fresh.message.witness.output.limit = fresh.minimumAmountOut;
    fresh.message.nonce = fresh.message.witness.nonce = "123";
    mockQuote(fresh);
    const base = await createClient(Partners.External, 8453, { disableAnalytics: true });
    const submitOrder = vi.fn().mockResolvedValue({ id: "accepted", deadline: Date.now() + 180_000 } as Order);
    const client = { ...base, submitOrder };
    const signOrder = vi.fn().mockResolvedValue("0x1234");
    const execution = submitSwap({ client, quote, userAddress: request.user, walletInteractions: {
      getAllowance: async () => request.inAmount, wrapNativeToken: vi.fn(), approveToken: vi.fn(), signOrder,
    } });
    if (!improves) {
      await expect(execution).rejects.toThrow("Swap price changed");
      expect(signOrder).not.toHaveBeenCalled();
      expect(submitOrder).not.toHaveBeenCalled();
      return;
    }
    await execution;
    const signed = signOrder.mock.calls[0][0].typedData.message;
    expect(signed.nonce).toBe("123");
    expect(signed.witness.output.limit).toBe(fresh.minimumAmountOut);
    expect(signed.witness.slippage).toBe(500);
    expect(submitOrder).toHaveBeenCalledWith(signed, "0x1234", { signal: undefined });
  });

  it.each(["limit", "amount", "chain", "adapter", "types"])("rejects a mismatched relay %s", async field => {
    const data = relay();
    mockQuote(data);
    const quote = await getQuote(request);
    const client = await createClient(Partners.External, 8453, { disableAnalytics: true });
    if (field === "limit") quote.typedData.message.witness.output.limit = "1";
    if (field === "amount") quote.typedData.message.permitted.amount = "1";
    if (field === "chain") quote.typedData.domain.chainId = 1;
    if (field === "adapter") quote.typedData.message.witness.exchange.adapter = "0x2222222222222222222222222222222222222222";
    if (field === "types") quote.typedData.types.Order = [];
    expect(() => client.prepareSwap(quote, request.user)).toThrow();
  });
});

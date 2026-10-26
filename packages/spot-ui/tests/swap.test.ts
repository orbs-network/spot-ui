import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createClient, getMinimumOutputAmount, isSwapSupported, OrderStatus, Partners, submitSwap,
  SWAP_CAPABILITIES, type Order, type OrderWalletInteractions, type SwapQuote, type RePermitOrder,
} from "../src";
import { ADDRESS_1, ADDRESS_2, ADDRESS_3, createRePermitData } from "./fixtures";

const quote = (): SwapQuote => ({
  amountOut: "201", netAmountOut: "200", minimumAmountOut: "199", feeAmount: "1", receivedAt: Date.now(),
  request: { chainId: 56, partner: Partners.Thena, inToken: ADDRESS_2, outToken: ADDRESS_3, inAmount: "100", user: ADDRESS_1, slippage: 0.5 },
});
const order = { id: "0x1234", historyKey: "v2:0x1234", status: OrderStatus.Open, deadline: Date.now() + 900_000 } as Order;
const wallet = (): OrderWalletInteractions => ({
  getAllowance: vi.fn(async () => "100"), approveToken: vi.fn(async () => "0x22"),
  wrapNativeToken: vi.fn(async () => "0x33"), signOrder: vi.fn(async () => "0x11"),
});
const setup = async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(createRePermitData(56))));
  const base = await createClient(Partners.Thena, 56, { disableAnalytics: true });
  const client = { ...base, submitOrder: vi.fn(async (_order: RePermitOrder, _signature: `0x${string}`) => order), getOrder: vi.fn(async () => order) };
  const params = { client, quote: quote(), minimumOutputAmountRaw: "198", swapperAddress: ADDRESS_1, walletInteractions: wallet() };
  return { client, params };
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("router swap preparation", () => {
  it("prepares raw amounts with no decimals, form, balances, or USD prices", async () => {
    const { client, params } = await setup();
    const prepared = client.prepareSwap(params);
    expect(prepared).not.toHaveProperty("form");
    expect(prepared.order.witness).toMatchObject({ epoch: 0, slippage: 500, input: { amount: "100", maxAmount: "100" }, output: { limit: "198", recipient: ADDRESS_1, triggerLower: "0", triggerUpper: "0" } });
    expect(Number(prepared.order.witness.deadline) - Number(prepared.order.witness.start)).toBe(900);
    expect(prepared.approvalRequest).toEqual({ tokenAddress: ADDRESS_2, amount: "100", spenderAddress: client.spenderAddress });
    expect(BigInt(client.prepareSwap(params).order.nonce)).toBeGreaterThan(BigInt(prepared.order.nonce));
  });

  it.each([
    { chainId: 1 }, { partner: Partners.Quick }, { user: ADDRESS_2 }, { inAmount: "1.5" }, { inToken: "0x0000000000000000000000000000000000000000" },
  ])("rejects a mismatched or unusable quote before wallet work: %o", async change => {
    const { params } = await setup();
    params.quote = { ...params.quote, request: { ...params.quote.request, ...change } };
    await expect(submitSwap(params)).rejects.toThrow();
    expect(params.walletInteractions.getAllowance).not.toHaveBeenCalled();
    expect(params.walletInteractions.signOrder).not.toHaveBeenCalled();
  });

  it("declares and gates exact-output and alternate-recipient requests", async () => {
    const { params } = await setup();
    expect(SWAP_CAPABILITIES).toEqual({ exactInput: true, exactOutput: false, customRecipient: false });
    expect(isSwapSupported({ swapperAddress: ADDRESS_1 })).toBe(true);
    expect(isSwapSupported({ swapperAddress: ADDRESS_1, tradeType: "exact-output" })).toBe(false);
    await expect(submitSwap({ ...params, tradeType: "exact-output" })).rejects.toThrow("exact input");
    await expect(submitSwap({ ...params, recipient: ADDRESS_2 })).rejects.toThrow("recipient");
    expect(params.walletInteractions.getAllowance).not.toHaveBeenCalled();
  });

  it("rejects a same-token swap before asking the wallet to approve or sign", async () => {
    const { params } = await setup();
    params.quote = { ...params.quote, request: { ...params.quote.request, outToken: params.quote.request.inToken.toUpperCase().replace("0X", "0x") } };
    await expect(submitSwap(params)).rejects.toThrow("tokens must be different");
    expect(params.walletInteractions.getAllowance).not.toHaveBeenCalled();
    expect(params.walletInteractions.signOrder).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "201"])("rejects invalid reviewed minimum %s", async minimumOutputAmountRaw => {
    const { client, params } = await setup();
    expect(() => client.prepareSwap({ ...params, minimumOutputAmountRaw })).toThrow();
  });

  it("rechecks the optional freshness policy after approval before signing", async () => {
    const { params } = await setup();
    const now = params.quote.receivedAt;
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.mocked(params.walletInteractions.getAllowance).mockResolvedValueOnce("0").mockResolvedValue("100");
    vi.mocked(params.walletInteractions.approveToken).mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(now + 1001); return "0x22"; });
    await expect(submitSwap({ ...params, maxQuoteAgeMillis: 1000 })).rejects.toThrow("stale");
    expect(params.walletInteractions.signOrder).not.toHaveBeenCalled();
    expect(params.client.submitOrder).not.toHaveBeenCalled();
  });
});

describe("shared swap execution", () => {
  it("returns an accepted intent, leaving settlement to the host", async () => {
    const { params } = await setup();
    const events: string[] = [];
    const result = await submitSwap({ ...params, onUpdate: update => { events.push(`${update.phase}:${update.event}`); } });
    expect(result).toMatchObject({ type: "intent", status: "submitted", orderId: order.id, order });
    expect(params.client.getOrder).not.toHaveBeenCalled();
    expect(events).toEqual(["preparing:request", "preparing:request", "signing:request", "signing:prepared", "signing:success", "submitting:request"]);
    expect(params.walletInteractions.signOrder).toHaveBeenCalledWith(expect.objectContaining({ signerAddress: ADDRESS_1 }));
  });

  it("locks duplicate submissions and snapshots quote identity before the first await", async () => {
    const { params } = await setup();
    let release!: (amount: string) => void;
    vi.mocked(params.walletInteractions.getAllowance).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = submitSwap(params);
    await expect(submitSwap(params)).rejects.toThrow("already in progress");
    Object.assign(params.quote, { request: { ...params.quote.request, inAmount: "200" } });
    params.minimumOutputAmountRaw = "190";
    release("100");
    await expect(first).resolves.toMatchObject({ orderId: order.id });
    expect(params.client.submitOrder.mock.calls[0]![0].witness.output.limit).toBe("198");
    expect(params.client.submitOrder.mock.calls[0]![0].witness.input.amount).toBe("100");
    expect(params.client.submitOrder).toHaveBeenCalledOnce();
  });

  it("verifies approval with bounded retries and stops before signing if allowance stays low", async () => {
    const { params } = await setup();
    vi.mocked(params.walletInteractions.getAllowance).mockResolvedValue("0");
    vi.useFakeTimers();
    const pending = submitSwap(params);
    const rejection = expect(pending).rejects.toThrow("Insufficient allowance");
    await vi.advanceTimersByTimeAsync(6000);
    await rejection;
    expect(params.walletInteractions.getAllowance).toHaveBeenCalledTimes(4);
    expect(params.walletInteractions.approveToken).toHaveBeenCalledOnce();
    expect(params.walletInteractions.signOrder).not.toHaveBeenCalled();
  });

  it("preserves the accepted intent when cancellation happens during submission", async () => {
    const { params } = await setup();
    const controller = new AbortController();
    params.client.submitOrder.mockImplementation(async () => { controller.abort(); return order; });
    await expect(submitSwap({ ...params, signal: controller.signal, onUpdate: () => { throw new Error("Observer"); } }))
      .resolves.toMatchObject({ orderId: order.id, status: "submitted" });
    expect(params.client.submitOrder).toHaveBeenCalledOnce();
  });

  it("aborts after a wallet step without opening the next wallet request", async () => {
    const { params } = await setup();
    const controller = new AbortController();
    vi.mocked(params.walletInteractions.wrapNativeToken).mockImplementation(async () => { controller.abort(); return "0x33"; });
    await expect(submitSwap({ ...params, nativeInput: true, signal: controller.signal })).rejects.toThrow();
    expect(params.walletInteractions.signOrder).not.toHaveBeenCalled();
    expect(params.client.submitOrder).not.toHaveBeenCalled();
  });
});

describe("router quote amounts", () => {
  it("rounds down using exact integer amounts and the quote service's bps conversion", () => {
    expect(getMinimumOutputAmount("270311015092003391", 0.5)).toBe("268959460016543374");
    expect(getMinimumOutputAmount("10000", 0.29)).toBe("9971");
    expect(getMinimumOutputAmount("10000", 0.125)).toBe("9987");
    expect(() => getMinimumOutputAmount("1", 0.5)).toThrow("too small");
  });
});

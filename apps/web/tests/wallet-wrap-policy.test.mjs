// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maxUint256 } from "viem";
import { createClient, OrderStatus, Partners } from "@orbs-network/spot-ui";
import { createHostSwapExecution } from "@orbs-network/spot-react/internal";
import { useWalletInteractions } from "../lib/hooks/use-wallet-interactions";

const mocks = vi.hoisted(() => ({
  inputAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  hash: `0x${"1".repeat(64)}`,
  convert: vi.fn(),
  complete: vi.fn(),
  refetch: vi.fn(),
  isNative: vi.fn(),
  readContract: vi.fn(),
  writeContract: vi.fn(),
  signTypedData: vi.fn(),
  getBlockNumber: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ chainId: 1, chain: { id: 1 } }),
  useWalletClient: () => ({ data: { account: { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, writeContract: mocks.writeContract, signTypedData: mocks.signTypedData, getChainId: async () => 1, getAddresses: async () => ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] } }),
  usePublicClient: () => ({ chain: { id: 1 }, readContract: mocks.readContract, getBlockNumber: mocks.getBlockNumber }),
}));
vi.mock("../lib/wagmi-config", () => ({ wagmiConfig: {} }));
vi.mock("../lib/utils", () => ({
  isNativeAddress: mocks.isNative,
  getWrappedNativeCurrency: () => ({ address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
}));
vi.mock("../lib/hooks/use-derived-swap", () => ({
  useDerivedSwap: () => ({ inputCurrency: { address: mocks.inputAddress } }),
}));
vi.mock("../lib/hooks/use-wrap", () => ({
  useWrappedNativeTransaction: () => ({ mutateAsync: mocks.convert, complete: mocks.complete }),
}));
vi.mock("../lib/hooks/use-balances", () => ({
  useRefetchSelectedCurrenciesBalances: () => ({ mutateAsync: mocks.refetch }),
}));

let root;
let wallet;
const mount = async () => {
  root = createRoot(document.createElement("div"));
  const Harness = () => {
    const adapter = useWalletInteractions();
    useEffect(() => { wallet = adapter; }, [adapter]);
    return null;
  };
  await act(async () => root.render(createElement(Harness)));
};
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  mocks.inputAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  mocks.isNative.mockReturnValue(true);
  mocks.readContract.mockResolvedValue(10n);
  mocks.writeContract.mockResolvedValue(mocks.hash);
  mocks.signTypedData.mockResolvedValue("0x1234");
  mocks.getBlockNumber.mockResolvedValue(100n);
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ status: "success", blockNumber: "100" })));
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.convert.mockResolvedValue({
    operation: { hash: mocks.hash, action: "wrap", amount: "10", status: "confirmed" },
    contextChanged: false,
  });
});
afterEach(async () => { if (root) await act(async () => root.unmount()); vi.unstubAllGlobals(); });

describe("DEX wallet wrapping policy", () => {
  it("skips wrapping for ERC-20 input without requesting a native conversion", async () => {
    mocks.isNative.mockReturnValue(false);
    await mount();
    expect(await wallet.shouldWrap()).toBe(false);
    expect(mocks.isNative).toHaveBeenCalledWith(mocks.inputAddress);
    expect(mocks.convert).not.toHaveBeenCalled();
  });

  it("skips approval when the current allowance is sufficient", async () => {
    await mount();
    expect(await wallet.shouldApprove({ tokenAddress: mocks.inputAddress, spenderAddress: mocks.inputAddress, amount: "10", approvalAmount: maxUint256.toString() })).toBe(false);
    expect(mocks.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "allowance" }));
    expect(mocks.writeContract).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("confirms approval only when the current allowance is insufficient", async () => {
    mocks.readContract.mockResolvedValue(9n);
    await mount();
    const request = { tokenAddress: mocks.inputAddress, spenderAddress: mocks.inputAddress, amount: "10", approvalAmount: maxUint256.toString() };
    expect(await wallet.shouldApprove(request)).toBe(true);
    await expect(wallet.approveToken(request)).resolves.toBe(mocks.hash);
    expect(mocks.readContract).toHaveBeenCalledOnce();
    expect(mocks.writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "approve", args: [mocks.inputAddress, maxUint256] }));
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("propagates an allowance read failure without requesting approval", async () => {
    mocks.readContract.mockRejectedValue(new Error("RPC unavailable"));
    await mount();
    await expect(wallet.shouldApprove({ tokenAddress: mocks.inputAddress, spenderAddress: mocks.inputAddress, amount: "10", approvalAmount: maxUint256.toString() })).rejects.toThrow("RPC unavailable");
    expect(mocks.writeContract).not.toHaveBeenCalled();
  });

  it("returns only the confirmed hash for the exact requested wrap", async () => {
    await mount();
    expect(await wallet.shouldWrap()).toBe(true);
    await expect(wallet.wrapNativeToken("10")).resolves.toBe(mocks.hash);
    expect(mocks.convert).toHaveBeenCalledWith({ action: "wrap", amount: "10" });
    expect(mocks.complete).toHaveBeenCalledWith(mocks.hash);
  });

  it.each([
    { action: "wrap", amount: "20" },
    { action: "unwrap", amount: "10" },
  ])("finishes unrelated confirmed recovery and stops for a fresh review: %j", async (scenario) => {
    mocks.convert.mockResolvedValueOnce({
      operation: { hash: mocks.hash, action: scenario.action, amount: scenario.amount, status: "confirmed" },
      contextChanged: false,
    });
    await mount();
    await expect(wallet.wrapNativeToken("10")).rejects.toThrow(/previous token conversion/i);
    expect(mocks.convert).toHaveBeenCalledTimes(1);
    expect(mocks.refetch).toHaveBeenCalledWith(["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
    expect(mocks.complete).toHaveBeenCalledWith(mocks.hash);
  });

  it("preserves an operation if wallet context changed before continuing", async () => {
    mocks.convert.mockResolvedValueOnce({
      operation: { hash: mocks.hash, action: "wrap", amount: "10", status: "confirmed" },
      contextChanged: true,
    });
    await mount();
    await expect(wallet.wrapNativeToken("10")).rejects.toThrow(/changed/i);
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});

const account = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const inputToken = "0x1111111111111111111111111111111111111111";
const outputToken = "0x2222222222222222222222222222222222222222";
const spender = "0x3333333333333333333333333333333333333333";
const adapter = "0x4444444444444444444444444444444444444444";
let integrationId = 0;
const json = data => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
const deferred = () => {
  let resolve;
  const promise = new Promise(accept => { resolve = accept; });
  return { promise, resolve };
};

/** Real host execution and public SDK methods plus the real web wallet adapter; only wallet/RPC/HTTP boundaries are stubbed. */
const approvalIntegration = async ({ decimals, caps, extraRaw = 0n, staleLatest = false, headBlock, laterCap, approveExact = false, receiptBlockValue = block => block.toString() }) => {
  const unit = 10n ** BigInt(decimals);
  const requested = 198n * unit + extraRaw;
  const events = [];
  const approvalRequests = [];
  let written = 0;
  let confirmed = 0;
  let receiptBlock = 99n;
  const hashes = [`0x${"1".repeat(64)}`, `0x${"2".repeat(64)}`];
  mocks.inputAddress = inputToken;
  mocks.isNative.mockReturnValue(false);
  mocks.writeContract.mockImplementation(async request => {
    events.push({ type: "approve", request });
    return hashes[written++];
  });
  mocks.readContract.mockImplementation(async request => {
    const hasNewerReduction = headBlock !== undefined && laterCap !== undefined && request.blockNumber >= headBlock;
    const recordedCap = confirmed ? BigInt(hasNewerReduction ? laterCap : caps[confirmed - 1]) * unit : 0n;
    // A load-balanced RPC can serve an earlier head with the old, larger cap.
    const staleHead = confirmed > 0 && staleLatest && request.blockNumber === undefined;
    const allowance = staleHead ? requested : recordedCap;
    events.push({ type: "allowance", confirmed, blockNumber: request.blockNumber, allowance });
    return allowance;
  });
  mocks.getBlockNumber.mockImplementation(async () => headBlock ?? (staleLatest ? receiptBlock - 1n : receiptBlock));
  mocks.signTypedData.mockImplementation(async request => {
    events.push({ type: "sign", request });
    return "0x1234";
  });
  const configuration = {
    domain: { name: "RePermit", version: "1", chainId: 1, verifyingContract: spender },
    primaryType: "Order", types: {},
    order: {
      permitted: { token: inputToken, amount: "0" }, spender, nonce: "0", deadline: "0",
      witness: {
        reactor: spender, executor: spender, exchange: { adapter, ref: adapter, share: 0, data: "0x" },
        swapper: account, nonce: "0", deadline: "0", chainid: 1, exclusivity: 0, epoch: 0, slippage: 0, freshness: 0,
        input: { token: inputToken, amount: "0", maxAmount: "0" },
        output: { token: outputToken, limit: "0", recipient: account },
      },
    },
  };
  mocks.fetch.mockImplementation(async (url, options) => {
    const parsed = new URL(String(url), "https://web.example");
    if (parsed.pathname.endsWith("/config")) return json(configuration);
    if (parsed.pathname === "/api/transaction-receipt") {
      const hash = parsed.searchParams.get("hash");
      expect(hash).toBe(hashes[confirmed]);
      confirmed += 1;
      receiptBlock += 1n;
      events.push({ type: "receipt", hash, blockNumber: receiptBlock });
      return json({ status: "success", blockNumber: receiptBlockValue(receiptBlock), transactionHash: hash });
    }
    if (parsed.pathname.endsWith("/orders/new")) {
      const posted = JSON.parse(options.body);
      events.push({ type: "submit", posted });
      return json({ success: true, signedOrder: {
        ...posted, hash: `0x${"3".repeat(64)}`, timestamp: new Date().toISOString(),
        metadata: { expectedChunks: 1, status: "completed", description: "", lastPriceCheck: "", nextEligibleTime: "",
          displayOnlyInputTokenPriceUSD: "", repermitDigest: "0xdigest" },
      } });
    }
    throw new Error(`Unexpected integration request: ${url}`);
  });
  await mount();
  const client = await createClient(Partners.Quick, 1, {
    disableAnalytics: true, apiUrl: `https://wallet-integration-${++integrationId}.example/v2`,
  });
  const execution = createHostSwapExecution(client, {
    account, walletInteractions: {
      ...wallet,
      approveToken: request => {
        approvalRequests.push(request);
        return wallet.approveToken(approveExact ? { ...request, approvalAmount: request.amount } : request);
      },
    },
    quote: {
      request: { chainId: 1, partner: Partners.Quick, inToken: inputToken, outToken: outputToken,
        inAmount: requested.toString(), user: account, slippage: 0.5 },
      receivedAt: Date.now(), amountOut: "20", netAmountOut: "20", minimumAmountOut: "18", feeAmount: "0",
    },
  });
  return { execution, requested, events, hashes, approvalRequests };
};

describe("real wallet approval execution", () => {
  it.each([false, true])("lets the DEX choose the suggested or exact approval cap (exact=%s)", async approveExact => {
    const f = await approvalIntegration({ decimals: 18, caps: [198], approveExact });
    await expect(f.execution.run()).resolves.toMatchObject({ status: OrderStatus.Completed });

    expect(f.approvalRequests).toEqual([{
      tokenAddress: inputToken, spenderAddress: spender,
      amount: f.requested.toString(), approvalAmount: maxUint256.toString(),
    }]);
    expect(mocks.writeContract).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      functionName: "approve", args: [spender, approveExact ? f.requested : maxUint256],
    }));
    expect(f.execution.preparedOrder.approvalRequest).toMatchObject({
      amount: f.requested.toString(), approvalAmount: maxUint256.toString(),
    });
    // A confirmed cap equal to the input is enough, even when the suggestion is unlimited.
    expect(mocks.signTypedData).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      message: expect.objectContaining({ permitted: { token: inputToken, amount: f.requested.toString() } }),
    }));
  });

  it("keeps the newest confirmed block when concurrent approval receipts arrive out of order", async () => {
    const hashes = [`0x${"1".repeat(64)}`, `0x${"2".repeat(64)}`];
    const receipts = [deferred(), deferred()];
    const fetching = deferred();
    let requests = 0;
    mocks.inputAddress = inputToken;
    mocks.isNative.mockReturnValue(false);
    mocks.writeContract.mockResolvedValueOnce(hashes[0]).mockResolvedValueOnce(hashes[1]);
    mocks.fetch.mockImplementation(url => {
      const hash = new URL(String(url), "https://web.example").searchParams.get("hash");
      if (++requests === 2) fetching.resolve();
      return receipts[hashes.indexOf(hash)].promise;
    });
    await mount();
    const request = { tokenAddress: inputToken, spenderAddress: spender, amount: "198", approvalAmount: maxUint256.toString() };
    const first = wallet.approveToken(request);
    const second = wallet.approveToken(request);
    await fetching.promise;
    receipts[1].resolve(json({ status: "success", blockNumber: "101" }));
    await expect(second).resolves.toBe(hashes[1]);
    receipts[0].resolve(json({ status: "success", blockNumber: "100" }));
    await expect(first).resolves.toBe(hashes[0]);

    mocks.getBlockNumber.mockResolvedValue(99n);
    mocks.readContract.mockResolvedValue(198n);
    await expect(wallet.shouldApprove(request)).resolves.toBe(false);

    expect(mocks.readContract).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      address: inputToken, functionName: "allowance", args: [account, spender], blockNumber: 101n,
    }));
    expect(mocks.signTypedData).not.toHaveBeenCalled();
  });

  it("uses a newer confirmed receipt that arrives while an allowance check awaits the RPC head", async () => {
    const hashes = [`0x${"1".repeat(64)}`, `0x${"2".repeat(64)}`];
    const checking = deferred();
    const head = deferred();
    mocks.inputAddress = inputToken;
    mocks.isNative.mockReturnValue(false);
    mocks.writeContract.mockResolvedValueOnce(hashes[0]).mockResolvedValueOnce(hashes[1]);
    mocks.fetch.mockImplementationOnce(async () => json({ status: "success", blockNumber: "100" }))
      .mockImplementationOnce(async () => json({ status: "success", blockNumber: "101" }));
    mocks.getBlockNumber.mockImplementationOnce(() => { checking.resolve(); return head.promise; });
    // Block 101 contains a concurrent approval that reduced the previous 198 cap to 100.
    mocks.readContract.mockImplementation(async request => request.blockNumber >= 101n ? 100n : 198n);
    await mount();
    const request = { tokenAddress: inputToken, spenderAddress: spender, amount: "198", approvalAmount: maxUint256.toString() };
    await expect(wallet.approveToken(request)).resolves.toBe(hashes[0]);
    const pendingCheck = wallet.shouldApprove(request);
    await checking.promise;
    expect(mocks.readContract).not.toHaveBeenCalled();
    await expect(wallet.approveToken(request)).resolves.toBe(hashes[1]);
    head.resolve(99n);
    await expect(pendingCheck).resolves.toBe(true);

    expect(mocks.readContract).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      address: inputToken, functionName: "allowance", args: [account, spender], blockNumber: 101n,
    }));
    expect(mocks.signTypedData).not.toHaveBeenCalled();
  });

  it.each([0, 6, 18])("requests approval again when a wallet reduces 198 to 100 (%s decimals)", async decimals => {
    const f = await approvalIntegration({ decimals, caps: [100, 198] });
    await expect(f.execution.run()).resolves.toMatchObject({ status: OrderStatus.Completed });

    expect(mocks.writeContract).toHaveBeenCalledTimes(2);
    for (const [request] of mocks.writeContract.mock.calls) {
      expect(request).toMatchObject({ address: inputToken, functionName: "approve", args: [spender, maxUint256] });
    }
    for (const [request] of mocks.readContract.mock.calls) {
      expect(request).toMatchObject({ address: inputToken, functionName: "allowance", args: [account, spender] });
    }
    expect(f.events.filter(event => event.type === "allowance" && event.confirmed > 0).map(event => event.allowance))
      .toEqual([100n * 10n ** BigInt(decimals), f.requested]);
    expect(f.events.map(event => event.type)).toEqual([
      "allowance", "allowance", "approve", "receipt", "allowance", "approve", "receipt", "allowance", "sign", "submit",
    ]);
    expect(f.execution.approvalTxHash).toBe(f.hashes[1]);
    expect(mocks.signTypedData).toHaveBeenCalledOnce();
    expect(mocks.signTypedData.mock.calls[0][0].message.permitted.amount).toBe(f.requested.toString());
    expect(f.events.filter(event => event.type === "submit")).toHaveLength(1);
  });

  it.each([0, 6, 18])("never signs when both confirmed approvals remain capped at 100 of 198 (%s decimals)", async decimals => {
    const f = await approvalIntegration({ decimals, caps: [100, 100] });
    await expect(f.execution.run()).rejects.toMatchObject({ code: "INSUFFICIENT_ALLOWANCE" });

    expect(mocks.writeContract).toHaveBeenCalledTimes(2);
    expect(f.events.filter(event => event.type === "receipt")).toHaveLength(2);
    expect(f.execution.approvalTxHash).toBe(f.hashes[1]);
    expect(f.execution.preparedOrder).toBeUndefined();
    expect(mocks.signTypedData).not.toHaveBeenCalled();
    expect(f.events.filter(event => event.type === "submit")).toEqual([]);
  });

  it("does not trust a stale latest allowance that still reports the old 198 cap", async () => {
    const f = await approvalIntegration({ decimals: 18, caps: [100, 100], staleLatest: true });
    await expect(f.execution.run()).rejects.toMatchObject({ code: "INSUFFICIENT_ALLOWANCE" });

    expect(mocks.writeContract).toHaveBeenCalledTimes(2);
    const reads = f.events.filter(event => event.type === "allowance" && event.confirmed > 0);
    expect(reads).toMatchObject([
      { blockNumber: 100n, allowance: 100n * 10n ** 18n },
      { blockNumber: 101n, allowance: 100n * 10n ** 18n },
    ]);
    expect(mocks.signTypedData).not.toHaveBeenCalled();
    expect(f.events.filter(event => event.type === "submit")).toEqual([]);
  });

  it("checks a newer RPC head so a later reduction of the approved cap also prevents signing", async () => {
    const f = await approvalIntegration({ decimals: 18, caps: [198, 198], headBlock: 102n, laterCap: 100 });
    await expect(f.execution.run()).rejects.toMatchObject({ code: "INSUFFICIENT_ALLOWANCE" });

    expect(mocks.writeContract).toHaveBeenCalledTimes(2);
    expect(mocks.getBlockNumber).toHaveBeenCalledWith({ cacheTime: 0 });
    expect(f.events.filter(event => event.type === "allowance" && event.confirmed > 0)).toMatchObject([
      { blockNumber: 102n, allowance: 100n * 10n ** 18n },
      { blockNumber: 102n, allowance: 100n * 10n ** 18n },
    ]);
    expect(mocks.signTypedData).not.toHaveBeenCalled();
    expect(f.events.filter(event => event.type === "submit")).toEqual([]);
  });

  it("compares exact base units when allowance is one unit short above JavaScript's safe integer range", async () => {
    const f = await approvalIntegration({ decimals: 18, caps: [198, 198], extraRaw: 1n });
    await expect(f.execution.run()).rejects.toMatchObject({ code: "INSUFFICIENT_ALLOWANCE" });

    expect(mocks.writeContract).toHaveBeenCalledTimes(2);
    expect(mocks.writeContract.mock.calls[0][0].args).toEqual([spender, maxUint256]);
    expect(f.approvalRequests[0].amount).toBe("198000000000000000001");
    expect(mocks.signTypedData).not.toHaveBeenCalled();
    expect(f.events.filter(event => event.type === "submit")).toEqual([]);
  });

  it("accepts hex block numbers from approval receipts and still verifies the edited spending cap", async () => {
    const f = await approvalIntegration({ decimals: 18, caps: [100, 198], receiptBlockValue: block => `0x${block.toString(16)}` });
    await expect(f.execution.run()).resolves.toMatchObject({ status: OrderStatus.Completed });

    expect(mocks.writeContract).toHaveBeenCalledTimes(2);
    expect(f.events.filter(event => event.type === "allowance" && event.confirmed > 0)).toMatchObject([
      { blockNumber: 100n, allowance: 100n * 10n ** 18n },
      { blockNumber: 101n, allowance: 198n * 10n ** 18n },
    ]);
    expect(mocks.signTypedData).toHaveBeenCalledOnce();
  });

  it.each([undefined, null, "", "not-a-block", "-1", 1.5])(
    "does not sign when a confirmed approval receipt has no valid block number (%s)",
    async blockNumber => {
      const f = await approvalIntegration({ decimals: 18, caps: [198, 198], receiptBlockValue: () => blockNumber });
      await expect(f.execution.run()).rejects.toThrow(/block|confirmation/i);

      expect(mocks.writeContract).toHaveBeenCalledOnce();
      expect(mocks.signTypedData).not.toHaveBeenCalled();
      expect(f.events.filter(event => event.type === "submit")).toEqual([]);
    },
  );

  it("does not sign or request another approval when the post-receipt RPC head is unavailable", async () => {
    const f = await approvalIntegration({ decimals: 18, caps: [198, 198] });
    mocks.getBlockNumber.mockRejectedValue(new Error("RPC head unavailable"));
    await expect(f.execution.run()).rejects.toThrow("RPC head unavailable");

    expect(mocks.writeContract).toHaveBeenCalledOnce();
    expect(f.execution.approvalTxHash).toBe(f.hashes[0]);
    expect(mocks.signTypedData).not.toHaveBeenCalled();
    expect(f.events.filter(event => event.type === "submit")).toEqual([]);
  });
});

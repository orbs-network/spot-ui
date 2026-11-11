// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maxUint256 } from "viem";
import { OrderStatus, OrderVariant, Partners, SpotError } from "@orbs-network/spot-react";
import { useDirectSwapExecution } from "../lib/hooks/use-direct-swap-execution";
import { idleSwapExecution, useDirectSwapStore } from "../lib/swap-execution-store";

const mocks = vi.hoisted(() => ({
  connection: {},
  form: { inputAmount: "10" },
  contextKey: "reviewed-swap",
  wallet: undefined,
  refreshBalances: vi.fn(),
}));

vi.mock("wagmi/actions", () => ({ getConnection: () => mocks.connection }));
vi.mock("../lib/wagmi-config", () => ({ wagmiConfig: {} }));
vi.mock("../lib/hooks/store", () => ({ useSwapStore: { getState: () => mocks.form } }));

const account = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const inputAddress = "0x1111111111111111111111111111111111111111";
const outputAddress = "0x2222222222222222222222222222222222222222";
const spender = "0x3333333333333333333333333333333333333333";
const signedOrder = {
  permitted: { token: inputAddress, amount: "10" },
  spender, nonce: "100", deadline: "1900000000",
  witness: {
    swapper: account, chainid: 1, nonce: "100", deadline: "1900000000",
    input: { token: inputAddress, amount: "10", maxAmount: "10" },
    output: { token: outputAddress, limit: "18", recipient: account },
  },
};
const signingRequest = () => ({ signerAddress: account, typedData: { message: structuredClone(signedOrder) } });
const order = () => ({
  id: "accepted-swap", historyKey: "2:1:accepted-swap", version: 2, chainId: 1,
  maker: account, type: OrderVariant.SWAP, status: OrderStatus.Open, progress: 0,
  deadline: Date.now() + 180_000,
  rawOrder: { order: structuredClone(signedOrder) },
});
const completed = () => ({ ...order(), status: OrderStatus.Completed, progress: 100 });
const client = () => {
  const sdk = { chainId: 1, partner: Partners.Quick, runSwap: vi.fn(), getOrder: vi.fn(), getOrders: vi.fn() };
  sdk.createSwapExecution = vi.fn(params => {
    const shouldWrap = params.walletInteractions.shouldWrap.bind(params.walletInteractions);
    const shouldApprove = params.walletInteractions.shouldApprove.bind(params.walletInteractions);
    const approvalRequest = { tokenAddress: params.quote.request.inToken, spenderAddress: spender, amount: params.quote.request.inAmount, approvalAmount: maxUint256.toString() };
    let wrapped = false;
    let approved = false;
    let latestOrder;
    let preparedOrder;
    let signature;
    let wrapTxHash;
    let approvalTxHash;
    const captureProgress = (update, onProgress) => {
      latestOrder = update.order ?? latestOrder;
      preparedOrder = update.preparedOrder ?? preparedOrder;
      signature = update.signature ?? signature;
      wrapTxHash = update.wrapTxHash ?? wrapTxHash;
      approvalTxHash = update.approvalTxHash ?? approvalTxHash;
      if (update.phase === "wrapping" && (update.event === "success" || update.event === "skipped")) wrapped = true;
      if (update.phase === "approving" && (update.event === "success" || update.event === "skipped")) approved = true;
      if (["signing", "submitting", "settling"].includes(update.phase)) { wrapped = true; approved = true; }
      onProgress?.(update);
    };
    return {
      get order() { return latestOrder; },
      get preparedOrder() { return preparedOrder; },
      get signature() { return signature; },
      get wrapTxHash() { return wrapTxHash; },
      get approvalTxHash() { return approvalTxHash; },
      shouldWrap: vi.fn(async () => wrapped ? false : shouldWrap()),
      shouldApprove: vi.fn(async () => approved ? false : shouldApprove({ ...approvalRequest })),
      run: vi.fn((options = {}) => {
        const onProgress = update => captureProgress(update, options.onProgress);
        return Promise.resolve(sdk.runSwap({ ...params, onProgress })).then(order => {
          latestOrder = order;
          wrapped = true;
          approved = true;
          return order;
        });
      }),
      waitForCompletion: vi.fn(),
      cancel: vi.fn(),
    };
  });
  return sdk;
};
const progress = (phase, event, extra = {}) => ({ phase, event, steps: ["create"], stepIndex: 0, hasApproval: true, ...extra });
const prepared = () => ({ order: structuredClone(signedOrder), signingRequest: signingRequest() });
const review = (sdk = client()) => ({
  client: sdk,
  quote: {
    request: { chainId: 1, partner: Partners.Quick, inToken: inputAddress, outToken: outputAddress,
      inAmount: "10", user: account, slippage: 0.5 },
    receivedAt: Date.now(), amountOut: "20", netAmountOut: "20", minimumAmountOut: "18", feeAmount: "0",
  },
  account, contextKey: "reviewed-swap",
  inputToken: { address: inputAddress, decimals: 0, symbol: "IN" },
  outputToken: { address: outputAddress, decimals: 0, symbol: "OUT" },
  inputAmountUi: "10",
});
const wallet = () => ({
  shouldWrap: vi.fn().mockReturnValue(false),
  shouldApprove: vi.fn().mockReturnValue(false),
  wrapNativeToken: vi.fn().mockResolvedValue("0xwrap"),
  approveToken: vi.fn().mockResolvedValue("0xapprove"),
  signOrder: vi.fn().mockResolvedValue("0xsignature"),
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};

// Exercise the host's context checks through the execution object's wallet boundary.
const executeWalletPrerequisites = async ({ walletInteractions, onProgress }) => {
  onProgress(progress("preparing", "request"));
  if (await walletInteractions.shouldWrap()) {
    onProgress(progress("wrapping", "request"));
    const wrapTxHash = await walletInteractions.wrapNativeToken("10");
    onProgress(progress("wrapping", "success", { wrapTxHash }));
  }
  const approval = { tokenAddress: inputAddress, spenderAddress: spender, amount: "10", approvalAmount: maxUint256.toString() };
  if (await walletInteractions.shouldApprove(approval)) {
    onProgress(progress("approving", "request"));
    const approvalTxHash = await walletInteractions.approveToken(approval);
    onProgress(progress("approving", "success", { approvalTxHash }));
  }
};
const executeWalletFlow = async params => {
  const { walletInteractions, onProgress } = params;
  await executeWalletPrerequisites(params);
  onProgress(progress("signing", "prepared", { preparedOrder: prepared() }));
  const signature = await walletInteractions.signOrder(signingRequest());
  onProgress(progress("signing", "success", { signature }));
  onProgress(progress("submitting", "request"));
  return completed();
};

let root;
let hook;
const mount = async () => {
  root = createRoot(document.createElement("div"));
  const Harness = () => {
    const api = useDirectSwapExecution({
      contextKey: mocks.contextKey, walletInteractions: mocks.wallet, refreshBalances: mocks.refreshBalances,
    });
    useEffect(() => { hook = api; }, [api]);
    return null;
  };
  await act(async () => root.render(createElement(Harness)));
};
const unmount = async () => { await act(async () => root.unmount()); root = undefined; };
const execute = async (snapshot) => { await act(async () => hook.execute(snapshot)); };

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.connection = { chainId: 1, address: account };
  mocks.form = { inputAmount: "10" };
  mocks.contextKey = "reviewed-swap";
  mocks.wallet = wallet();
  mocks.refreshBalances.mockResolvedValue(undefined);
  useDirectSwapStore.getState().controller?.abort();
  useDirectSwapStore.setState({ execution: idleSwapExecution(), controller: undefined, confirmedWrap: undefined });
});
afterEach(async () => {
  if (root) await unmount();
  useDirectSwapStore.getState().controller?.abort();
  useDirectSwapStore.setState({ execution: idleSwapExecution(), controller: undefined, confirmedWrap: undefined });
});

describe("provider-free host swap execution", () => {
  it("captures the approved quote and token metadata before later caller mutations", async () => {
    const sdk = client();
    const result = deferred();
    sdk.runSwap.mockReturnValue(result.promise);
    const snapshot = review(sdk);
    await mount();
    let pending;
    await act(async () => {
      pending = hook.execute(snapshot);
      snapshot.quote.netAmountOut = "999";
      snapshot.quote.minimumAmountOut = "998";
      snapshot.quote.request.inAmount = "999";
      snapshot.inputToken.symbol = "CHANGED";
      snapshot.outputToken.decimals = 18;
    });

    expect(hook.review.quote).toMatchObject({
      netAmountOut: "20", minimumAmountOut: "18", request: { inAmount: "10" },
    });
    expect(hook.review.inputToken.symbol).toBe("IN");
    expect(hook.review.outputToken.decimals).toBe(0);
    expect(sdk.createSwapExecution.mock.calls[0][0].quote.netAmountOut).toBe("20");

    await act(async () => { result.resolve(completed()); await pending; });
    expect(hook.phase).toBe("success");
  });

  it("releases the submission lock when the SDK expires the order before sending its POST", async () => {
    const sdk = client();
    sdk.runSwap.mockImplementationOnce(async ({ onProgress }) => {
      onProgress(progress("submitting", "request"));
      throw new SpotError("ORDER_EXPIRED", "Order expired before submission");
    }).mockResolvedValueOnce(completed());
    await mount();
    const snapshot = review(sdk);
    await execute(snapshot);
    expect(hook).toMatchObject({ phase: "failed", error: expect.objectContaining({ code: "ORDER_EXPIRED" }) });
    expect(sdk.getOrder).not.toHaveBeenCalled();
    expect(sdk.getOrders).not.toHaveBeenCalled();
    await execute(snapshot);
    expect(hook.phase).toBe("success");
    expect(sdk.runSwap).toHaveBeenCalledTimes(2);
  });

  it("returns a decreased quote to review without an error or an automatic retry", async () => {
    const sdk = client();
    const snapshot = review(sdk);
    const decreased = new SpotError("QUOTE_MINIMUM_DECREASED", "Swap minimum output decreased");
    sdk.runSwap.mockImplementationOnce(async ({ onProgress }) => {
      onProgress(progress("signing", "request"));
      onProgress(progress("signing", "error", { error: decreased }));
      throw decreased;
    });
    await mount();
    const startedAt = Date.now();
    await execute(snapshot);

    expect(hook).toMatchObject({ phase: "price-changed", isActive: false, review: snapshot });
    expect(hook.priceChangedAt).toBeGreaterThanOrEqual(startedAt);
    expect(hook.error).toBeUndefined();
    expect(hook.sdkExecution).toBeUndefined();
    expect(hook.signedOrder).toBeUndefined();
    expect(hook.order).toBeUndefined();
    expect(useDirectSwapStore.getState().controller).toBeUndefined();
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
    expect(sdk.createSwapExecution).toHaveBeenCalledOnce();
    expect(sdk.runSwap).toHaveBeenCalledOnce();
    expect(sdk.getOrder).not.toHaveBeenCalled();
    expect(sdk.getOrders).not.toHaveBeenCalled();
  });

  it("accepts repeated price changes without wrapping twice and checks allowance on every attempt", async () => {
    const sdk = client();
    const snapshot = review(sdk);
    const decreased = new SpotError("QUOTE_MINIMUM_DECREASED", "Swap minimum output decreased");
    const rejectQuote = async params => {
      await executeWalletPrerequisites(params);
      params.onProgress(progress("signing", "request"));
      throw decreased;
    };
    sdk.runSwap.mockImplementationOnce(rejectQuote).mockImplementationOnce(rejectQuote).mockImplementationOnce(executeWalletFlow);
    mocks.wallet.shouldWrap.mockReturnValue(true);
    mocks.wallet.shouldApprove.mockResolvedValueOnce(true).mockResolvedValue(false);
    await mount();
    await execute(snapshot);

    expect(hook).toMatchObject({ phase: "price-changed", wrapTxHash: "0xwrap", approvalTxHash: "0xapprove", hasConfirmedWrap: true });
    expect(useDirectSwapStore.getState().confirmedWrap).toMatchObject({
      account, chainId: 1, tokenAddress: inputAddress, contextKey: snapshot.contextKey, amountRaw: "10",
    });
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
    await unmount();
    await mount();
    const accepted = { ...snapshot, quote: { ...snapshot.quote, receivedAt: hook.priceChangedAt + 1, netAmountOut: "19", minimumAmountOut: "17" } };
    await execute(accepted);

    expect(hook).toMatchObject({ phase: "price-changed", review: accepted, wrapTxHash: "0xwrap", approvalTxHash: "0xapprove" });
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
    const acceptedAgain = { ...accepted, quote: { ...accepted.quote, receivedAt: hook.priceChangedAt + 1, netAmountOut: "18", minimumAmountOut: "16" } };
    await execute(acceptedAgain);

    expect(hook.phase).toBe("success");
    expect(sdk.createSwapExecution).toHaveBeenCalledTimes(3);
    expect(sdk.createSwapExecution.mock.calls[1][0].quote.minimumAmountOut).toBe("17");
    expect(sdk.createSwapExecution.mock.calls[2][0].quote.minimumAmountOut).toBe("16");
    expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledExactlyOnceWith("10");
    expect(mocks.wallet.shouldApprove).toHaveBeenCalledTimes(3);
    expect(mocks.wallet.approveToken).toHaveBeenCalledExactlyOnceWith({ tokenAddress: inputAddress, spenderAddress: spender, amount: "10", approvalAmount: maxUint256.toString() });
    expect(mocks.wallet.signOrder).toHaveBeenCalledOnce();
    expect(useDirectSwapStore.getState().confirmedWrap).toBeUndefined();
  });

  it.each(["amount", "slippage", "output"])("does not reuse a price-change wrap after the review changes %s", async changed => {
    const sdk = client();
    const snapshot = review(sdk);
    sdk.runSwap.mockImplementationOnce(async params => {
      await executeWalletPrerequisites(params);
      throw new SpotError("QUOTE_MINIMUM_DECREASED", "Swap minimum output decreased");
    }).mockImplementationOnce(executeWalletFlow);
    mocks.wallet.shouldWrap.mockReturnValue(true);
    await mount();
    await execute(snapshot);
    expect(hook.phase).toBe("price-changed");
    await unmount();
    const nextReview = { ...snapshot, quote: { ...snapshot.quote, request: { ...snapshot.quote.request } }, contextKey: `changed-${changed}` };
    if (changed === "amount") {
      nextReview.inputAmountUi = "20";
      nextReview.quote.request.inAmount = "20";
      mocks.form.inputAmount = "20";
    } else if (changed === "slippage") nextReview.quote.request.slippage = 1;
    else nextReview.quote.request.outToken = "0x4444444444444444444444444444444444444444";
    mocks.contextKey = nextReview.contextKey;
    await mount();
    await execute(nextReview);

    expect(hook).toMatchObject({ phase: "failed", wrapTxHash: "0xwrap", error: expect.objectContaining({ code: "WRAP_FAILED" }) });
    expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledOnce();
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
  });

  it("keeps a quote error after submission locked for status reconciliation", async () => {
    const sdk = client();
    sdk.runSwap.mockImplementationOnce(async ({ onProgress }) => {
      onProgress(progress("signing", "prepared", { preparedOrder: prepared() }));
      onProgress(progress("submitting", "request"));
      throw new SpotError("QUOTE_MINIMUM_DECREASED", "A late quote error");
    });
    await mount();
    const snapshot = review(sdk);
    await execute(snapshot);

    expect(hook).toMatchObject({ phase: "unconfirmed", signedOrder, error: expect.objectContaining({ code: "QUOTE_MINIMUM_DECREASED" }) });
    expect(hook.priceChangedAt).toBeUndefined();
    await execute(snapshot);
    expect(sdk.createSwapExecution).toHaveBeenCalledOnce();
  });

  it("retains an unknown submission and its duplicate-submit lock through remounts", async () => {
    const sdk = client();
    const snapshot = review(sdk);
    const response = deferred();
    sdk.runSwap.mockImplementation(async ({ walletInteractions, onProgress }) => {
      onProgress(progress("signing", "prepared", { preparedOrder: prepared() }));
      await walletInteractions.signOrder(signingRequest());
      onProgress(progress("submitting", "request"));
      return response.promise;
    });
    await mount();
    let pending;
    await act(async () => { pending = hook.execute(snapshot); });
    expect(hook.phase).toBe("settling");
    await unmount();
    await mount();
    await execute(snapshot);
    expect(sdk.runSwap).toHaveBeenCalledOnce();
    expect(sdk.createSwapExecution.mock.calls[0][0]).not.toHaveProperty("onProgress");
    expect(hook.sdkExecution.run).toHaveBeenCalledWith({ onProgress: expect.any(Function) });
    await act(async () => {
      response.reject(new Error("POST response was lost"));
      await pending;
    });
    expect(hook.phase).toBe("unconfirmed");
    expect(hook.signedOrder).toEqual(signedOrder);
    await unmount();
    await mount();
    await execute(snapshot);
    expect(hook.phase).toBe("unconfirmed");
    expect(sdk.runSwap).toHaveBeenCalledOnce();
    sdk.getOrders.mockResolvedValue({ orders: [], legacyLoaded: false });
    await act(async () => hook.checkOrderStatus());
    expect(hook.phase).toBe("unconfirmed");
    expect(sdk.getOrder).not.toHaveBeenCalled();
    await execute(snapshot);
    expect(sdk.runSwap).toHaveBeenCalledOnce();
  });

  it("recovers an exact signed intent using only its original client and saved account", async () => {
    const sdk = client();
    const snapshot = review(sdk);
    sdk.runSwap.mockImplementation(async ({ walletInteractions, onProgress }) => {
      onProgress(progress("signing", "prepared", { preparedOrder: prepared() }));
      await walletInteractions.signOrder(signingRequest());
      onProgress(progress("submitting", "request"));
      throw new Error("POST response was lost");
    });
    await mount();
    await execute(snapshot);
    await unmount();

    const accepted = order();
    const differentIntent = { ...order(), rawOrder: { order: { ...signedOrder, nonce: "101" } } };
    sdk.getOrders.mockResolvedValue({ orders: [differentIntent, accepted], legacyLoaded: false });
    const filled = completed();
    sdk.getOrder.mockResolvedValue(filled);
    mocks.connection = { chainId: 137, address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    mocks.contextKey = "another-wallet-and-trade";
    mocks.wallet = wallet();
    await mount();
    await act(async () => hook.checkOrderStatus());

    expect(sdk.getOrders).toHaveBeenCalledWith(expect.objectContaining({
      account, legacyOrders: false, signal: expect.any(AbortSignal),
    }));
    expect(hook).toMatchObject({ phase: "unconfirmed", order: accepted });
    expect(sdk.getOrder).not.toHaveBeenCalled();
    await act(async () => hook.checkOrderStatus());
    expect(sdk.getOrder).toHaveBeenCalledExactlyOnceWith({ orderId: accepted.id, signal: expect.any(AbortSignal) });
    expect(sdk.getOrders).toHaveBeenCalledOnce();
    expect(sdk.createSwapExecution).toHaveBeenCalledOnce();
    expect(sdk.runSwap).toHaveBeenCalledOnce();
    expect(mocks.wallet.wrapNativeToken).not.toHaveBeenCalled();
    expect(mocks.wallet.approveToken).not.toHaveBeenCalled();
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
    expect(hook).toMatchObject({ phase: "success", order: filled });
  });

  it.each([OrderStatus.Cancelled, OrderStatus.Expired])("marks a known swap %s after one read", async status => {
    const sdk = client();
    const accepted = order();
    const snapshot = review(sdk);
    sdk.getOrder.mockResolvedValue({ ...accepted, status });
    useDirectSwapStore.setState({ execution: { ...idleSwapExecution(), phase: "unconfirmed", review: snapshot, order: accepted, signedOrder } });
    mocks.connection = {};
    await mount();
    await act(async () => hook.checkOrderStatus());
    expect(hook).toMatchObject({ phase: "failed", order: expect.objectContaining({ status }) });
    expect(sdk.getOrder).toHaveBeenCalledOnce();
    expect(sdk.createSwapExecution).not.toHaveBeenCalled();
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
  });

  it("keeps missing/network results locked and lets the user check again", async () => {
    const sdk = client();
    const accepted = order();
    const snapshot = review(sdk);
    sdk.getOrder.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce(completed());
    useDirectSwapStore.setState({ execution: { ...idleSwapExecution(), phase: "unconfirmed", review: snapshot, order: accepted, signedOrder } });
    await mount();
    await act(async () => hook.checkOrderStatus());
    expect(hook).toMatchObject({ phase: "unconfirmed", order: accepted });
    await execute(snapshot);
    expect(sdk.createSwapExecution).not.toHaveBeenCalled();
    await act(async () => hook.checkOrderStatus());
    expect(hook).toMatchObject({ phase: "unconfirmed", order: accepted });
    await act(async () => hook.checkOrderStatus());
    expect(hook.phase).toBe("success");
    expect(sdk.getOrder).toHaveBeenCalledTimes(3);
    expect(sdk.createSwapExecution).not.toHaveBeenCalled();
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
  });

  it("unlocks an expired unknown swap only after a successful current-service history check", async () => {
    const sdk = client();
    const expired = structuredClone(signedOrder);
    expired.deadline = expired.witness.deadline = String(Math.floor(Date.now() / 1000) - 1);
    sdk.getOrders.mockResolvedValue({ orders: [], legacyLoaded: false });
    useDirectSwapStore.setState({ execution: { ...idleSwapExecution(), phase: "unconfirmed", review: review(sdk), signedOrder: expired } });
    await mount();
    await act(async () => hook.checkOrderStatus());
    expect(hook).toMatchObject({ phase: "failed", error: expect.objectContaining({ code: "ORDER_EXPIRED" }) });
    expect(sdk.getOrders).toHaveBeenCalledExactlyOnceWith({ account, legacyOrders: false, getv1orders: false, rejectInvalidOrders: true, signal: expect.any(AbortSignal) });
    expect(sdk.createSwapExecution).not.toHaveBeenCalled();
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
    await act(async () => hook.reset());
    expect(hook.phase).toBe("idle");
  });

  it.each(["network", "invalid-response"])("keeps an expired unknown swap unresolved when history is unavailable (%s)", async failure => {
    const sdk = client();
    const expired = structuredClone(signedOrder);
    expired.deadline = expired.witness.deadline = String(Math.floor(Date.now() / 1000) - 1);
    sdk.getOrders.mockRejectedValue(failure === "network" ? new Error("History unavailable") : new SpotError("INVALID_RESPONSE", "Malformed order history"));
    useDirectSwapStore.setState({ execution: { ...idleSwapExecution(), phase: "unconfirmed", review: review(sdk), signedOrder: expired } });
    await mount();
    await act(async () => hook.checkOrderStatus());
    expect(hook.phase).toBe("unconfirmed");
    await act(async () => hook.reset());
    expect(hook.phase).toBe("unconfirmed");
    expect(sdk.createSwapExecution).not.toHaveBeenCalled();
  });

  it.each(["saved", "execution"])("keeps a known accepted expired swap unresolved when lookup is missing (%s)", async source => {
    const sdk = client();
    const expired = structuredClone(signedOrder);
    expired.deadline = expired.witness.deadline = String(Math.floor(Date.now() / 1000) - 1);
    const accepted = order();
    sdk.getOrder.mockResolvedValue(undefined);
    useDirectSwapStore.setState({ execution: {
      ...idleSwapExecution(), phase: "unconfirmed", review: review(sdk), signedOrder: expired,
      ...(source === "saved" ? { order: accepted } : { sdkExecution: { order: accepted } }),
    } });
    await mount();
    await act(async () => hook.checkOrderStatus());
    expect(hook.phase).toBe("unconfirmed");
    expect(sdk.getOrder).toHaveBeenCalledExactlyOnceWith({ orderId: accepted.id, signal: expect.any(AbortSignal) });
    expect(sdk.getOrders).not.toHaveBeenCalled();
    expect(sdk.createSwapExecution).not.toHaveBeenCalled();
  });

  it.each([{ id: "wrong" }, { historyKey: "wrong" }, { chainId: 137 }])("rejects a mismatched completed snapshot: %j", async mismatch => {
    const sdk = client();
    const accepted = order();
    const snapshot = review(sdk);
    sdk.getOrder.mockResolvedValue({ ...completed(), ...mismatch });
    useDirectSwapStore.setState({ execution: { ...idleSwapExecution(), phase: "unconfirmed", review: snapshot, order: accepted, signedOrder } });
    await mount();
    await act(async () => hook.checkOrderStatus());
    expect(hook).toMatchObject({ phase: "unconfirmed", order: accepted, error: expect.any(Error) });
    expect(sdk.createSwapExecution).not.toHaveBeenCalled();
  });

  it("keeps tracking an accepted execution after the connected wallet changes", async () => {
    const sdk = client();
    const settlement = deferred();
    sdk.runSwap.mockImplementation(async ({ onProgress }) => {
      onProgress(progress("settling", "accepted", { order: order() }));
      const filled = await settlement.promise;
      onProgress(progress("settling", "success", { order: filled }));
      return filled;
    });
    await mount();
    let pending;
    await act(async () => { pending = hook.execute(review(sdk)); });
    expect(hook.phase).toBe("settling");
    mocks.connection = { chainId: 137, address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    await act(async () => { settlement.resolve(completed()); await pending; });
    expect(hook.phase).toBe("success");
    expect(sdk.runSwap).toHaveBeenCalledOnce();
  });

  it("requires a fresh wrapping decision after a confirmed wrap and rejected signature", async () => {
    const sdk = client();
    const snapshot = review(sdk);
    sdk.runSwap.mockImplementation(executeWalletFlow);
    mocks.wallet.shouldWrap.mockReturnValue(true);
    mocks.wallet.signOrder.mockRejectedValueOnce(new Error("Wallet rejected signing"));
    await mount();
    await execute(snapshot);
    expect(hook.phase).toBe("failed");
    expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledExactlyOnceWith("10");
    expect(hook.hasConfirmedWrap).toBe(true);
    await unmount();
    await mount();
    await execute(snapshot);
    expect(hook).toMatchObject({ phase: "failed", wrapTxHash: "0xwrap", error: expect.objectContaining({ code: "WRAP_FAILED" }) });
    expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledOnce();
    expect(mocks.wallet.signOrder).toHaveBeenCalledOnce();
    mocks.wallet.shouldWrap.mockReturnValue(false);
    await execute(snapshot);
    expect(hook.phase).toBe("success");
    expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledOnce();
    expect(sdk.runSwap).toHaveBeenCalledTimes(3);
  });

  it.each(["amount", "slippage", "output"])("retains the confirmed wrap guard when a failed review changes %s", async changed => {
    const sdk = client();
    const snapshot = review(sdk);
    sdk.runSwap.mockImplementation(executeWalletFlow);
    mocks.wallet.shouldWrap.mockReturnValue(true);
    mocks.wallet.signOrder.mockRejectedValueOnce(new Error("Wallet rejected signing"));
    await mount();
    await execute(snapshot);
    expect(hook.phase).toBe("failed");
    await unmount();
    const nextReview = structuredClone({ ...snapshot, client: undefined });
    nextReview.client = sdk;
    nextReview.contextKey = `changed-${changed}`;
    if (changed === "amount") {
      nextReview.inputAmountUi = "20";
      nextReview.quote.request.inAmount = "20";
      mocks.form.inputAmount = "20";
    } else if (changed === "slippage") nextReview.quote.request.slippage = 1;
    else nextReview.quote.request.outToken = "0x4444444444444444444444444444444444444444";
    mocks.contextKey = nextReview.contextKey;
    await mount();
    await execute(nextReview);
    expect(hook).toMatchObject({ phase: "failed", wrapTxHash: "0xwrap", error: expect.objectContaining({ code: "WRAP_FAILED" }) });
    expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledOnce();
    expect(mocks.wallet.signOrder).toHaveBeenCalledOnce();
  });

  it.each(["account", "chain", "token"])("allows a fresh native wrap in an independent %s scope", async changed => {
    const sdk = client();
    const snapshot = review(sdk);
    sdk.runSwap.mockImplementation(executeWalletFlow);
    mocks.wallet.shouldWrap.mockReturnValue(true);
    useDirectSwapStore.setState({ confirmedWrap: { account, chainId: 1, tokenAddress: inputAddress, hash: "0xprevious" } });
    if (changed === "account") {
      snapshot.account = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
      mocks.connection.address = snapshot.account;
    } else if (changed === "chain") {
      sdk.chainId = 137;
      snapshot.quote.request.chainId = 137;
      mocks.connection.chainId = 137;
    } else snapshot.quote.request.inToken = "0x4444444444444444444444444444444444444444";
    await mount();
    await execute(snapshot);
    expect(hook.phase).toBe("success");
    expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledExactlyOnceWith("10");
  });

  it("ignores a late wallet signature after the SDK has already failed that attempt", async () => {
    const sdk = client();
    const snapshot = review(sdk);
    const lateSignature = deferred();
    mocks.wallet.signOrder.mockReturnValueOnce(lateSignature.promise);
    let originalSigner;
    sdk.runSwap.mockImplementationOnce(async ({ walletInteractions, onProgress }) => {
      onProgress(progress("signing", "prepared", { preparedOrder: prepared() }));
      originalSigner = walletInteractions.signOrder(signingRequest());
      void originalSigner.catch(() => undefined);
      throw new Error("The signing deadline expired");
    });
    await mount();
    await execute(snapshot);
    expect(hook.phase).toBe("failed");

    const nextSwap = deferred();
    sdk.runSwap.mockReturnValueOnce(nextSwap.promise);
    let nextAttempt;
    await act(async () => { nextAttempt = hook.execute(snapshot); });
    expect(hook.phase).toBe("preparing");
    await act(async () => {
      lateSignature.resolve("0xlate-signature");
      await originalSigner.catch(() => undefined);
    });
    expect(hook.phase).toBe("preparing");
    expect(hook.signedOrder).toBeUndefined();
    await act(async () => { nextSwap.resolve(completed()); await nextAttempt; });
    expect(hook.phase).toBe("success");
  });

  it("retains a late confirmed wrap and requires the host to review wrapping before retry", async () => {
    const sdk = client();
    const snapshot = review(sdk);
    const receipt = deferred();
    mocks.wallet.shouldWrap.mockReturnValue(true);
    mocks.wallet.wrapNativeToken.mockReturnValueOnce(receipt.promise);
    sdk.runSwap.mockImplementation(async params => {
      try { return await executeWalletFlow(params); }
      catch (error) {
        params.onProgress(progress("wrapping", "error", { error }));
        throw error;
      }
    });
    await mount();
    let pending;
    await act(async () => { pending = hook.execute(snapshot); });
    expect(hook.phase).toBe("wrapping");
    mocks.connection = { chainId: 137, address: account };
    await act(async () => { receipt.resolve("0xconfirmed"); await pending; });
    expect(hook).toMatchObject({ phase: "failed", wrapTxHash: "0xconfirmed", hasConfirmedWrap: true });
    mocks.connection = { chainId: 1, address: account };
    await execute(snapshot);
    expect(hook).toMatchObject({ phase: "failed", error: expect.objectContaining({ code: "WRAP_FAILED" }) });
    expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledOnce();
    mocks.wallet.shouldWrap.mockReturnValue(false);
    await execute(snapshot);
    expect(hook.phase).toBe("success");
    expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledOnce();
  });

  it("stops before wallet writes when the connected chain changes during the wrap decision", async () => {
    const sdk = client();
    sdk.runSwap.mockImplementation(executeWalletFlow);
    const decision = deferred();
    mocks.wallet.shouldWrap.mockReturnValueOnce(decision.promise);
    await mount();
    let pending;
    await act(async () => { pending = hook.execute(review(sdk)); });
    expect(hook.phase).toBe("preparing");
    mocks.connection = { chainId: 137, address: account };
    await act(async () => { decision.resolve(true); await pending; });
    expect(hook).toMatchObject({ phase: "failed", error: expect.any(Error) });
    expect(mocks.wallet.wrapNativeToken).not.toHaveBeenCalled();
    expect(mocks.wallet.approveToken).not.toHaveBeenCalled();
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
  });
});

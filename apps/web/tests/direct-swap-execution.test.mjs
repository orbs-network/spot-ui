// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus, OrderType, Partners } from "@orbs-network/spot-react";
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
  maker: account, type: OrderType.SWAP, status: OrderStatus.Open, progress: 0,
  deadline: Date.now() + 180_000,
  rawOrder: { order: structuredClone(signedOrder) },
});
const completed = () => ({ ...order(), status: OrderStatus.Completed, progress: 100 });
const client = () => ({
  chainId: 1, partner: Partners.Quick,
  executeSwap: vi.fn(), executeOrder: vi.fn(), getAccountOrders: vi.fn(),
});
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
  inputAmountUi: "10", outputAmountUi: "20",
});
const wallet = () => ({
  shouldWrap: vi.fn().mockReturnValue(false),
  wrapNativeToken: vi.fn().mockResolvedValue("0xwrap"),
  getTokenBalance: vi.fn().mockResolvedValue("10"),
  getAllowance: vi.fn().mockResolvedValue("10"),
  approveToken: vi.fn().mockResolvedValue("0xapprove"),
  signOrder: vi.fn().mockResolvedValue("0xsignature"),
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};

// Models the public SDK's wallet contract, while submission/settlement remain one client call.
const executeWalletFlow = async ({ walletInteractions }) => {
  const wrapping = await walletInteractions.shouldWrap();
  await walletInteractions.getAllowance({ tokenAddress: inputAddress, spenderAddress: spender });
  if (wrapping) await walletInteractions.wrapNativeToken("10");
  await walletInteractions.signOrder(signingRequest());
  return { order: completed() };
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
  it("retains an unknown submission and its duplicate-submit lock through remounts", async () => {
    const sdk = client();
    const snapshot = review(sdk);
    const response = deferred();
    sdk.executeSwap.mockImplementation(async ({ walletInteractions }) => {
      await walletInteractions.signOrder(signingRequest());
      return response.promise;
    });
    await mount();
    let pending;
    await act(async () => { pending = hook.execute(snapshot); });
    expect(hook.phase).toBe("settling");
    await unmount();
    await mount();
    await execute(snapshot);
    expect(sdk.executeSwap).toHaveBeenCalledOnce();
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
    expect(sdk.executeSwap).toHaveBeenCalledOnce();
    sdk.getAccountOrders.mockResolvedValue({ orders: [], legacyLoaded: false });
    await act(async () => hook.resume());
    expect(hook.phase).toBe("unconfirmed");
    expect(sdk.executeOrder).not.toHaveBeenCalled();
    await execute(snapshot);
    expect(sdk.executeSwap).toHaveBeenCalledOnce();
  });

  it("recovers an exact signed intent using only its original client and saved account", async () => {
    const sdk = client();
    const snapshot = review(sdk);
    sdk.executeSwap.mockImplementation(async ({ walletInteractions }) => {
      await walletInteractions.signOrder(signingRequest());
      throw new Error("POST response was lost");
    });
    await mount();
    await execute(snapshot);
    await unmount();

    const accepted = order();
    const differentIntent = { ...order(), rawOrder: { order: { ...signedOrder, nonce: "101" } } };
    sdk.getAccountOrders.mockResolvedValue({ orders: [differentIntent, accepted], legacyLoaded: false });
    const filled = completed();
    sdk.executeOrder.mockResolvedValue(filled);
    mocks.connection = { chainId: 137, address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    mocks.contextKey = "another-wallet-and-trade";
    mocks.wallet = wallet();
    await mount();
    await act(async () => hook.resume());

    expect(sdk.getAccountOrders).toHaveBeenCalledWith(expect.objectContaining({
      account, getv1orders: false, legacyOrders: false, signal: expect.any(AbortSignal),
    }));
    expect(sdk.executeOrder).toHaveBeenCalledExactlyOnceWith({ order: accepted, signal: expect.any(AbortSignal) });
    expect(sdk.executeSwap).toHaveBeenCalledOnce();
    expect(mocks.wallet.shouldWrap).not.toHaveBeenCalled();
    expect(mocks.wallet.wrapNativeToken).not.toHaveBeenCalled();
    expect(mocks.wallet.approveToken).not.toHaveBeenCalled();
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
    expect(hook).toMatchObject({ phase: "success", order: filled });
  });

  it.each(["10", "4"])("checks the actual wrapped balance (%s) before retrying a rejected signature", async (balance) => {
    const sdk = client();
    const snapshot = review(sdk);
    sdk.executeSwap.mockImplementation(executeWalletFlow);
    mocks.wallet.shouldWrap.mockReturnValue(true);
    mocks.wallet.getTokenBalance.mockResolvedValue(balance);
    mocks.wallet.signOrder.mockRejectedValueOnce(new Error("Wallet rejected signing"));
    await mount();
    await execute(snapshot);
    expect(hook.phase).toBe("failed");
    expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledExactlyOnceWith("10");
    await unmount();
    await mount();
    await execute(snapshot);

    expect(mocks.wallet.getTokenBalance).toHaveBeenCalledExactlyOnceWith({ tokenAddress: inputAddress });
    expect(mocks.wallet.shouldWrap).toHaveBeenNthCalledWith(1);
    expect(mocks.wallet.shouldWrap).toHaveBeenNthCalledWith(2);
    if (balance === "10") expect(mocks.wallet.wrapNativeToken).toHaveBeenCalledOnce();
    else expect(mocks.wallet.wrapNativeToken.mock.calls).toEqual([["10"], ["6"]]);
    expect(hook.phase).toBe("success");
    expect(sdk.executeSwap).toHaveBeenCalledTimes(2);
  });

  it("ignores a late wallet signature after the SDK has already failed that attempt", async () => {
    const sdk = client();
    const snapshot = review(sdk);
    const lateSignature = deferred();
    mocks.wallet.signOrder.mockReturnValueOnce(lateSignature.promise);
    let originalSigner;
    sdk.executeSwap.mockImplementationOnce(async ({ walletInteractions }) => {
      originalSigner = walletInteractions.signOrder(signingRequest());
      void originalSigner.catch(() => undefined);
      throw new Error("The signing deadline expired");
    });
    await mount();
    await execute(snapshot);
    expect(hook.phase).toBe("failed");

    const nextSwap = deferred();
    sdk.executeSwap.mockReturnValueOnce(nextSwap.promise);
    let nextAttempt;
    await act(async () => { nextAttempt = hook.execute(snapshot); });
    expect(hook.phase).toBe("preparing");
    await act(async () => {
      lateSignature.resolve("0xlate-signature");
      await originalSigner.catch(() => undefined);
    });
    expect(hook.phase).toBe("preparing");
    expect(hook.signedOrder).toBeUndefined();
    await act(async () => { nextSwap.resolve({ order: completed() }); await nextAttempt; });
    expect(hook.phase).toBe("success");
  });

  it("stops before wallet writes when the connected chain changes during an async wrap decision", async () => {
    const sdk = client();
    sdk.executeSwap.mockImplementation(executeWalletFlow);
    const decision = deferred();
    mocks.wallet.shouldWrap.mockReturnValueOnce(decision.promise);
    await mount();
    let pending;
    await act(async () => { pending = hook.execute(review(sdk)); });
    expect(hook.phase).toBe("preparing");
    mocks.connection = { chainId: 137, address: account };
    await act(async () => { decision.resolve(true); await pending; });
    expect(hook).toMatchObject({ phase: "failed", error: expect.any(Error) });
    expect(mocks.wallet.getAllowance).not.toHaveBeenCalled();
    expect(mocks.wallet.wrapNativeToken).not.toHaveBeenCalled();
    expect(mocks.wallet.approveToken).not.toHaveBeenCalled();
    expect(mocks.wallet.signOrder).not.toHaveBeenCalled();
  });
});

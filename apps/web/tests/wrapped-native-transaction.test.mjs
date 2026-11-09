// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionRevertedError } from "../lib/hooks/use-get-transaction-receipt";
import { UnconfirmedWrappedNativeTransaction, useWrappedNativeTransaction } from "../lib/hooks/use-wrap";

const mocks = vi.hoisted(() => ({
  account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  wrapped: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  hash: `0x${"1".repeat(64)}`,
  connection: {},
  chainId: vi.fn(),
  accounts: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  listeners: new Set(),
}));
vi.mock("wagmi", () => ({
  useConnection: () => mocks.connection,
  useWalletClient: () => ({ data: {
    account: { address: mocks.account }, getChainId: mocks.chainId,
    getAddresses: mocks.accounts, writeContract: mocks.write,
  } }),
}));
vi.mock("wagmi/actions", () => ({
  getConnection: () => mocks.connection,
  watchConnection: (_config, { onChange }) => {
    mocks.listeners.add(onChange);
    return () => mocks.listeners.delete(onChange);
  },
}));
vi.mock("../lib/utils", () => ({ getWrappedNativeCurrency: () => ({ address: mocks.wrapped }) }));
vi.mock("../lib/wagmi-config", () => ({ wagmiConfig: {} }));
vi.mock("../lib/hooks/use-get-transaction-receipt", () => ({
  TransactionRevertedError: class TransactionRevertedError extends Error {},
  useGetTransactionReceiptCallback: () => ({ mutateAsync: mocks.receipt }),
}));

let client;
let root;
let hook;
const mount = async () => {
  root = createRoot(document.createElement("div"));
  const Harness = () => {
    const api = useWrappedNativeTransaction();
    useEffect(() => { hook = api; }, [api]);
    return null;
  };
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Harness))));
};
const unmount = async () => { await act(async () => root.unmount()); root = undefined; };
const run = async (amount = "10") => {
  let result;
  await act(async () => { result = await hook.mutateAsync({ action: "wrap", amount }); });
  return result;
};
const deferred = () => {
  let resolve;
  const promise = new Promise((accept) => { resolve = accept; });
  return { promise, resolve };
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.connection = { status: "connected", address: mocks.account, chainId: 1, chain: { id: 1 } };
  mocks.chainId.mockResolvedValue(1);
  mocks.accounts.mockResolvedValue([mocks.account]);
  mocks.write.mockResolvedValue(mocks.hash);
  mocks.receipt.mockResolvedValue({ status: "success" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => {
  if (root) await unmount();
  client.clear();
  mocks.listeners.clear();
});

describe("host native conversion recovery", () => {
  it("keeps a confirmed conversion through remounts until balances and continuation finish", async () => {
    await mount();
    await run();
    await unmount();
    await mount();
    expect(hook.operation.status).toBe("confirmed");
    // A failed balance refresh has not called complete; a changed amount still cannot deposit again.
    await run("20");
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.receipt).toHaveBeenCalledTimes(1);
    await act(async () => hook.complete(mocks.hash));
    await run("20");
    expect(mocks.write).toHaveBeenCalledTimes(2);
  });

  it("rechecks an uncertain receipt after remount, even with a cleared amount and zero native balance", async () => {
    mocks.receipt.mockRejectedValueOnce(new Error("RPC unavailable"));
    await mount();
    await act(async () => {
      await expect(hook.mutateAsync({ action: "wrap", amount: "10" }))
        .rejects.toBeInstanceOf(UnconfirmedWrappedNativeTransaction);
    });
    await unmount();
    await mount();
    expect(hook.operation.status).toBe("submitted");
    const record = client.getQueryCache().getAll().find((query) => query.queryKey.includes("operation"));
    expect(record.options.gcTime).toBe(Infinity);
    await run("0");
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.receipt).toHaveBeenLastCalledWith({ chainId: 1, hash: mocks.hash });
  });

  it("rejects duplicate clicks while a transaction is pending", async () => {
    const receipt = deferred();
    mocks.receipt.mockReturnValue(receipt.promise);
    await mount();
    let first;
    await act(async () => {
      first = hook.mutateAsync({ action: "wrap", amount: "10" });
      await expect(hook.mutateAsync({ action: "wrap", amount: "10" })).rejects.toThrow("already pending");
    });
    expect(mocks.write).toHaveBeenCalledTimes(1);
    await act(async () => { receipt.resolve({ status: "success" }); await first; });
  });

  it("rejects wallet changes before writing and marks changes during confirmation", async () => {
    await mount();
    mocks.chainId.mockResolvedValueOnce(137);
    await act(async () => {
      await expect(hook.mutateAsync({ action: "wrap", amount: "10" })).rejects.toThrow("Wallet account or network changed");
    });
    expect(mocks.write).not.toHaveBeenCalled();
    const receipt = deferred();
    mocks.receipt.mockReturnValue(receipt.promise);
    let pending;
    await act(async () => { pending = hook.mutateAsync({ action: "wrap", amount: "10" }); });
    mocks.connection = { ...mocks.connection, chainId: 137 };
    for (const listener of mocks.listeners) listener();
    let result;
    await act(async () => { receipt.resolve({ status: "success" }); result = await pending; });
    expect(result.contextChanged).toBe(true);
    expect(mocks.receipt).toHaveBeenCalledWith({ chainId: 1, hash: mocks.hash });
  });

  it("clears only a definite reverted or cancelled transaction so a deliberate retry can submit", async () => {
    mocks.receipt.mockRejectedValueOnce(new TransactionRevertedError("cancelled"));
    await mount();
    await act(async () => {
      await expect(hook.mutateAsync({ action: "wrap", amount: "10" })).rejects.toThrow("cancelled");
    });
    await run();
    expect(mocks.write).toHaveBeenCalledTimes(2);
  });
});

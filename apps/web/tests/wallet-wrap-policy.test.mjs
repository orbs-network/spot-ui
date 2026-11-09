// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWalletInteractions } from "../lib/hooks/use-wallet-interactions";

const mocks = vi.hoisted(() => ({
  inputAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  hash: `0x${"1".repeat(64)}`,
  convert: vi.fn(),
  complete: vi.fn(),
  refetch: vi.fn(),
  isNative: vi.fn(),
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ chainId: 1, chain: { id: 1 } }),
  useWalletClient: () => ({ data: {} }),
  usePublicClient: () => ({}),
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
  mocks.isNative.mockReturnValue(true);
  mocks.convert.mockResolvedValue({
    operation: { hash: mocks.hash, action: "wrap", amount: "10", status: "confirmed" },
    contextChanged: false,
  });
});
afterEach(async () => { if (root) await act(async () => root.unmount()); });

describe("DEX wallet wrapping policy", () => {
  it("asks the DEX's selected-input policy before requesting a native conversion", async () => {
    await mount();
    expect(wallet.shouldWrap()).toBe(true);
    expect(mocks.isNative).toHaveBeenCalledWith(mocks.inputAddress);
    mocks.isNative.mockReturnValue(false);
    expect(wallet.shouldWrap()).toBe(false);
    expect(mocks.convert).not.toHaveBeenCalled();
  });

  it("returns only the confirmed hash for the exact requested wrap", async () => {
    await mount();
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

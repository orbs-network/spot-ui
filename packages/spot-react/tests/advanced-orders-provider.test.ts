import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { isValidElement } from "react";
import * as publicApi from "../src/index";
import { AdvancedOrdersProvider } from "../src/context/advanced-orders-provider";
import {
  Module, Partners,
  type AdvancedOrderModule, type AdvancedOrdersProviderProps, type WalletInteractions,
} from "../src/types";

const state = vi.hoisted(() => ({
  read: vi.fn(() => ({ initialState: {}, formScopeKey: "advanced-order", trading: {} })),
}));

vi.mock("../src/context/use-advanced-orders-provider-state", () => ({
  useAdvancedOrdersProviderState: state.read,
}));

const walletInteractions: WalletInteractions = {
  shouldWrap: () => false,
  wrapNativeToken: async () => "0x1",
  approveToken: async () => "0x2",
  getAllowance: async () => "10",
  signOrder: async () => "0x3",
  cancelOrder: async () => "0x4",
};

const props: AdvancedOrdersProviderProps = {
  module: Module.TWAP,
  partner: Partners.Quick,
  walletInteractions,
  inputToken: { address: "0x1111111111111111111111111111111111111111", decimals: 0, symbol: "IN" },
  outputToken: { address: "0x2222222222222222222222222222222222222222", decimals: 0, symbol: "OUT" },
  wrappedNativeToken: undefined,
  inputBalanceRaw: "100",
  inputTokenUsdPrice: "1",
  priceProtectionPercent: 5,
  minTradeSizeUsd: 1,
  inputAmountUi: "10",
  marketQuote: { quotedOutputAmountRaw: "20" },
  children: "Advanced order form",
};

describe("AdvancedOrdersProvider boundary", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("exports the advanced provider and provider-free SDK functions", () => {
    expect(publicApi.AdvancedOrdersProvider).toBe(AdvancedOrdersProvider);
    expect(publicApi).not.toHaveProperty("SpotProvider");
    expect(publicApi.createClient).toBeTypeOf("function");
    expect(publicApi.getQuote).toBeTypeOf("function");
    expect(publicApi.isSwapSupported({ swapperAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })).toBe(true);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("excludes swaps from the provider's module type", () => {
    expectTypeOf<Module.SWAP>().not.toMatchTypeOf<AdvancedOrdersProviderProps["module"]>();
    expectTypeOf<AdvancedOrdersProviderProps["module"]>().toEqualTypeOf<AdvancedOrderModule>();
  });

  it.each([Module.TWAP, Module.LIMIT, Module.STOP_LOSS, Module.TAKE_PROFIT] as const)(
    "creates the React provider tree for advanced module %s",
    (module) => {
      const advancedProps = { ...props, module };
      expect(isValidElement(AdvancedOrdersProvider(advancedProps))).toBe(true);
      expect(state.read).toHaveBeenCalledExactlyOnceWith(advancedProps);
    },
  );

  it.each([Module.SWAP, undefined, "unknown-module"])(
    "rejects unsupported JavaScript module %s before provider state or resources initialize",
    (module) => {
      const invalidProps = { ...props, module } as unknown as AdvancedOrdersProviderProps;
      expect(() => AdvancedOrdersProvider(invalidProps)).toThrow(/client\.executeSwap.*without a provider/);
      expect(state.read).not.toHaveBeenCalled();
    },
  );
});

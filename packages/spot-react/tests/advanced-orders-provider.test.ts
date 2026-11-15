// @vitest-environment jsdom
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { act, createElement, isValidElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import * as sdkInternal from "@orbs-network/spot-ui/internal";
import { OrderStatus, OrderVariant, type Order, type SpotClient } from "@orbs-network/spot-ui";
import * as publicApi from "../src/index";
import { AdvancedOrdersProvider } from "../src/context/advanced-orders-provider";
import {
  ExecutionPhase, OrderType, Partners,
  type AdvancedOrdersProviderProps, type WalletInteractions,
} from "../src/types";
import { SpotTradingProvider } from "../src/context/spot-trading-context";
import { SpotStoreProvider, useSpotStoreApi } from "../src/context/spot-store-context";
import { SpotResources } from "../src/context/spot-resources";
import { useClient } from "../src/context/use-client";
import { useOrders } from "../src/hooks/order-hooks";

const state = vi.hoisted(() => ({
  read: vi.fn(() => ({ initialState: {}, formScopeKey: "advanced-order", trading: {} })),
}));

vi.mock("../src/context/use-advanced-orders-provider-state", () => ({
  useAdvancedOrdersProviderState: state.read,
}));

const walletInteractions: WalletInteractions = {
  shouldWrap: () => false, shouldApprove: () => false,
  wrapNativeToken: async () => "0x1",
  approveToken: async () => "0x2",
  signOrder: async () => "0x3",
  cancelOrder: async () => "0x4",
};

const props: AdvancedOrdersProviderProps = {
  orderType: OrderType.TWAP,
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
    expect(publicApi).not.toHaveProperty("Module");
    expect(publicApi.createClient).toBeTypeOf("function");
    expect(publicApi.getQuote).toBeTypeOf("function");
    expect(publicApi.isSwapSupported({ swapperAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })).toBe(true);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("excludes swaps from the provider's order type", () => {
    expectTypeOf<AdvancedOrdersProviderProps["orderType"]>().toEqualTypeOf<OrderType>();
    expect(publicApi.OrderType).not.toHaveProperty("SWAP");
    expect(Object.values(publicApi.OrderType)).toEqual(["TWAP", "LIMIT", "STOP_LOSS", "TAKE_PROFIT"]);
  });

  it.each([OrderType.TWAP, OrderType.LIMIT, OrderType.STOP_LOSS, OrderType.TAKE_PROFIT] as const)(
    "creates the React provider tree for advanced order type %s",
    (orderType) => {
      const advancedProps = { ...props, orderType };
      expect(isValidElement(AdvancedOrdersProvider(advancedProps))).toBe(true);
      expect(state.read).toHaveBeenCalledExactlyOnceWith(advancedProps);
    },
  );

  it.each(["SWAP", undefined, "unknown-order-type"])(
    "rejects unsupported JavaScript order type %s before provider state or resources initialize",
    (orderType) => {
      const invalidProps = { ...props, orderType } as unknown as AdvancedOrdersProviderProps;
      expect(() => AdvancedOrdersProvider(invalidProps)).toThrow(/client\.prepareSwap.*without a provider/);
      expect(state.read).not.toHaveBeenCalled();
    },
  );
});

describe("provider endpoint scope", () => {
  it("reconfigures clients and history and aborts pending wallet work when the endpoint changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const { useAdvancedOrdersProviderState } = await vi.importActual<typeof import("../src/context/use-advanced-orders-provider-state")>(
      "../src/context/use-advanced-orders-provider-state",
    );
    const account = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const productionApi = "https://order-sink-v2.orbs.network";
    const developmentApi = "https://order-sink-dev.orbs.network";
    let resolveHistory!: (value: { orders: Order[]; legacyLoaded: boolean }) => void;
    const oldHistory = new Promise<{ orders: Order[]; legacyLoaded: boolean }>(resolve => { resolveHistory = resolve; });
    const accepted = { id: "same-id", historyKey: "2:137:same-id", maker: account, chainId: 137,
      type: OrderVariant.TWAP_MARKET, status: OrderStatus.Open, progress: 0, createdAt: 1 } as Order;
    const productionClient = { apiUrl: productionApi, partner: Partners.Quick, chainId: 137,
      exchangeAddress: props.inputToken!.address, getOrders: vi.fn(() => oldHistory) } as unknown as SpotClient;
    const developmentClient = { ...productionClient, apiUrl: developmentApi,
      getOrders: vi.fn(async () => ({ orders: [accepted], legacyLoaded: true })) } as unknown as SpotClient;
    let resolveClient!: (client: SpotClient) => void;
    const pendingClient = new Promise<SpotClient>(resolve => { resolveClient = resolve; });
    const createClient = vi.spyOn(sdkInternal, "createClientWithAnalytics")
      .mockResolvedValueOnce(productionClient).mockReturnValueOnce(pendingClient);
    let currentClient: SpotClient | undefined;
    let currentOrders: ReturnType<typeof useOrders>["data"];
    let store: ReturnType<typeof useSpotStoreApi>;
    let scopeKey = "";
    const Probe = () => {
      const client = useClient();
      const orders = useOrders();
      const api = useSpotStoreApi();
      useEffect(() => { currentClient = client.data; currentOrders = orders.data; store = api; }, [client, orders, api]);
      return null;
    };
    const Harness = ({ apiUrl }: { apiUrl: string }) => {
      const state = useAdvancedOrdersProviderState({ ...props, chainId: 137, account, apiUrl, disableAnalytics: true });
      scopeKey = state.formScopeKey;
      return createElement(SpotTradingProvider, { value: state.trading, children:
        createElement(SpotStoreProvider, { initialState: state.initialState, children:
          createElement(SpotResources, { children: createElement(Probe) }),
        }),
      });
    };
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(createElement(Harness, { apiUrl: productionApi })));
      expect(currentClient).toBe(productionClient);
      const originalScope = scopeKey;
      const signal = vi.mocked(productionClient.getOrders).mock.calls[0]![0].signal!;
      const controller = store!.getState().acquireExecutionController()!;
      store!.getState().beginExecution({ account, chainId: 137, partner: Partners.Quick, apiUrl: productionApi, client: productionClient });

      await act(async () => root.render(createElement(Harness, { apiUrl: developmentApi })));
      expect(scopeKey).not.toBe(originalScope);
      expect(controller.signal.aborted).toBe(true);
      expect(signal.aborted).toBe(true);
      expect(currentClient).toBeUndefined();
      expect(currentOrders).toBeUndefined();

      await act(async () => {
        resolveHistory({ orders: [{ ...accepted, id: "old-endpoint" }], legacyLoaded: true });
        resolveClient(developmentClient);
      });
      expect(currentClient).toBe(developmentClient);
      expect(currentOrders?.all).toEqual([accepted]);
      expect(JSON.parse(store!.getState().orders.key!)[5]).toBe(developmentApi);
      expect(createClient).toHaveBeenLastCalledWith(Partners.Quick, 137,
        { disableAnalytics: true, apiUrl: developmentApi }, expect.anything());
      expect(store!.getState().state.currentExecution.phase).toBe(ExecutionPhase.PREPARING);
    } finally {
      await act(async () => root.unmount());
      createClient.mockRestore();
    }
  });
});

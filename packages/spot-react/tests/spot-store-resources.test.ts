import { describe, expect, it, vi } from "vitest";
import {
  OrderStatus,
  type Order,
  type SpotClient,
} from "@orbs-network/spot-ui";
import { createSpotStore } from "../src/context/create-spot-store";
import { ExecutionPhase, ExecutionStatus } from "../src/types";

const order = {
  id: "order-1",
  historyKey: "2:order-1",
  status: OrderStatus.Open,
  createdAt: 1,
} as Order;

describe("provider-scoped resources", () => {
  it("initializes and deduplicates the client within one provider store", async () => {
    const store = createSpotStore({});
    const client = { exchangeAddress: "0x1" } as SpotClient;
    const load = vi.fn(async () => client);

    store.getState().configureClient("partner:1", load);
    const [first, second] = await Promise.all([
      store.getState().refetchClient(),
      store.getState().refetchClient(),
    ]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toBe(client);
    expect(second).toBe(client);
    expect(store.getState().client).toEqual({
      key: "partner:1",
      data: client,
      isFetching: false,
    });
  });

  it("polls orders only while subscribed and updates cached orders", async () => {
    const store = createSpotStore({});
    const load = vi.fn(async () => ({
      orders: [{ ...order }],
      legacyLoaded: true,
    }));

    store.getState().configureOrders("account:exchange", load);
    expect(load).not.toHaveBeenCalled();

    const unsubscribe = store.getState().registerOrdersConsumer();
    await store.getState().refetchOrders(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.getState().orders.data).toEqual([order]);

    store
      .getState()
      .updateOrderStatus(order.historyKey, OrderStatus.Cancelled);
    expect(store.getState().orders.data?.[0]?.status).toBe(
      OrderStatus.Cancelled,
    );

    store.getState().addOrder(order);
    expect(store.getState().orders.data).toHaveLength(1);
    unsubscribe();
  });

  it("shares order polling until the last consumer unsubscribes", async () => {
    const store = createSpotStore({});
    const load = vi.fn(async () => ({
      orders: [order],
      legacyLoaded: true,
    }));

    store.getState().configureOrders("account:exchange", load);
    const unsubscribeFirst = store.getState().registerOrdersConsumer();
    const unsubscribeSecond = store.getState().registerOrdersConsumer();

    await store.getState().refetchOrders();
    expect(load).toHaveBeenCalledTimes(1);
    const firstResult = store.getState().orders.data;

    unsubscribeFirst();
    await store.getState().refetchOrders();
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.getState().orders.data).toBe(firstResult);

    unsubscribeSecond();
    await store.getState().refetchOrders();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("resets only form state when the form scope changes", () => {
    const store = createSpotStore({ tradeCount: 5, isMarketOrder: true });
    store.getState().updateState({
      limitPriceUi: "1.2",
      isPriceInverted: true,
      cancelOrders: {
        "2:order-1": { status: ExecutionStatus.LOADING },
      },
    });

    expect(
      store.getState().syncFormDefaults({
        tradeCount: 2,
        isMarketOrder: false,
      }),
    ).toBe(true);
    expect(store.getState().state.tradeCount).toBe(2);
    expect(store.getState().state.limitPriceUi).toBeUndefined();
    expect(store.getState().state.isPriceInverted).toBeUndefined();
    expect(store.getState().state.isMarketOrder).toBe(false);
    expect(store.getState().state.cancelOrders["2:order-1"]?.status).toBe(
      ExecutionStatus.LOADING,
    );
  });

  it("defers form-scope resets while execution is active", () => {
    const store = createSpotStore({ tradeCount: 5 });
    store.getState().beginExecution({});

    expect(store.getState().syncFormDefaults({ tradeCount: 1 })).toBe(false);
    expect(store.getState().state.tradeCount).toBe(5);
    expect(store.getState().state.currentExecution.phase).toBe(
      ExecutionPhase.PREPARING,
    );
  });
});

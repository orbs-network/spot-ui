import { beforeEach, describe, expect, it, vi } from "vitest";
import { Partners, type Order, type SpotClient } from "@orbs-network/spot-ui";
import { createSpotStore } from "../src/context/create-spot-store";
import { useAddNewOrder, useConfigureOrdersResource } from "../src/hooks/order-hooks";

const context = vi.hoisted(() => ({
  store: undefined as ReturnType<typeof createSpotStore> | undefined,
  account: "0x1",
  client: undefined as SpotClient | undefined,
}));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => unknown) => { effect(); },
}));
vi.mock("../src/context/spot-store-context", () => ({ useSpotStoreApi: () => context.store }));
vi.mock("../src/context/spot-trading-context", () => ({
  useSpotTrading: () => ({ account: context.account, supportLegacyOrders: false }),
}));
vi.mock("../src/context/use-client", () => ({ useClient: () => ({ data: context.client }) }));

beforeEach(() => {
  context.store = createSpotStore({});
  context.account = "0x1";
  context.client = { exchangeAddress: "0x2", partner: Partners.Quick, chainId: 137 } as SpotClient;
});

describe("accepted order cache scope", () => {
  it.each(["account", "chain", "partner"])("keeps a late submission out of a new %s's history", change => {
    useConfigureOrdersResource();
    const addPreviousOrder = useAddNewOrder();
    if (change === "account") context.account = "0x3";
    if (change === "chain") context.client = { ...context.client!, chainId: 1 };
    if (change === "partner") context.client = { ...context.client!, partner: Partners.Thena };
    useConfigureOrdersResource();
    addPreviousOrder({ id: "old", historyKey: "old" } as Order);
    expect(context.store!.getState().orders.data).toBeUndefined();

    const current = { id: "current", historyKey: "current" } as Order;
    useAddNewOrder()(current);
    expect(context.store!.getState().orders.data).toEqual([current]);
  });
});

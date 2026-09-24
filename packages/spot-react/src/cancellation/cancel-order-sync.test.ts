import { OrderStatus, type Order } from "@orbs-network/spot-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpotStore } from "../store/create-store";
import { useCancelOrder } from "./use-cancel-order";

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  cancelOrder: vi.fn(),
  onSuccess: vi.fn(),
}));
const store = createSpotStore({});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("../store/store-context", () => ({
  useSpotStoreApi: () => store,
  useSpotStore: (
    selector: (state: ReturnType<typeof store.getState>) => unknown,
  ) => selector(store.getState()),
}));
vi.mock("../provider/trading-context", () => ({
  useSpotTrading: () => ({
    account: "0x1",
    walletInteractions: { cancelOrder: mocks.cancelOrder },
    callbacks: { onCancelOrderSuccess: mocks.onSuccess },
  }),
}));
vi.mock("../client/use-client", () => ({
  useClient: () => ({
    data: {
      getCancelOrderRequest: () => ({}),
      analytics: {
        onCancelOrderRequest: vi.fn(),
        onCancelOrderSuccess: vi.fn(),
        onCancelOrderError: vi.fn(),
      },
    },
  }),
}));
vi.mock("../history/resource-hooks", () => ({
  useOrdersResource: () => ({ refetch: mocks.refetch }),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  store.getState().updateState({ cancelOrders: {} });
});

describe("cancel order history synchronization", () => {
  it.each([1, 2])(
    "keeps v%s cancellation loading across stale history responses",
    async (version) => {
      vi.useFakeTimers();
      const order = {
        id: "order",
        hash: "hash",
        historyKey: `${version}:order`,
        version,
        status: OrderStatus.Open,
      } as Order;
      mocks.cancelOrder.mockResolvedValue("0x123");
      mocks.refetch
        .mockResolvedValueOnce([order])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...order, status: OrderStatus.Cancelled }]);

      const cancellation = useCancelOrder(order).cancelOrder();
      await vi.advanceTimersByTimeAsync(0);
      expect(useCancelOrder(order).isLoading).toBe(true);
      expect(mocks.onSuccess).not.toHaveBeenCalled();
      expect(mocks.refetch).toHaveBeenCalledWith(version === 1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(useCancelOrder(order).isLoading).toBe(true);
      expect(mocks.onSuccess).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(await cancellation).toBe("0x123");
      expect(useCancelOrder(order).isLoading).toBe(false);
      expect(useCancelOrder(order).isSuccess).toBe(true);
      expect(mocks.onSuccess).toHaveBeenCalledOnce();
      expect(order.status).toBe(OrderStatus.Open);
    },
  );
});

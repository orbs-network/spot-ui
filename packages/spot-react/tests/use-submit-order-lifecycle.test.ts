import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus, type Order } from "@orbs-network/spot-ui";
import { createSpotStore } from "../src/context/create-spot-store";
import { executeOrder } from "../src/execute-order";
import { useSubmitOrder } from "../src/hooks/use-submit-order";
import { ExecutionPhase } from "../src/types";

// Drive effect cleanup while submission is still pending, without a DOM renderer.
const hooks = vi.hoisted(() => ({
  cleanup: undefined as (() => void) | undefined,
  store: undefined as ReturnType<typeof createSpotStore> | undefined,
  fetch: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => (() => void)) => { hooks.cleanup = effect(); },
}));
vi.mock("../src/execute-order", () => ({ executeOrder: vi.fn() }));
vi.mock("../src/context/order-form-context", () => ({ useOrderForm: () => ({}) }));
vi.mock("../src/context/spot-trading-context", () => ({ useSpotTrading: () => ({}) }));
vi.mock("../src/context/spot-store-context", () => ({ useSpotStoreApi: () => hooks.store }));
vi.mock("../src/context/use-client", () => ({ useClient: () => ({ data: {} }) }));
vi.mock("../src/hooks/order-hooks", () => ({
  useAddNewOrder: () => vi.fn(),
  useRefetchActiveOrders: () => vi.fn(),
}));

const order = {
  id: "swap", historyKey: "2:swap", status: OrderStatus.Open, version: 2, progress: 0,
  deadline: Date.now() + 900_000,
  chainId: 56,
} as Order;

beforeEach(() => {
  hooks.store = createSpotStore({});
  hooks.cleanup = undefined;
  vi.clearAllMocks();
  vi.stubGlobal("fetch", hooks.fetch);
  vi.mocked(executeOrder).mockReturnValue(new Promise(() => {}));
});
afterEach(() => vi.unstubAllGlobals());

describe("submission lifecycle", () => {
  it("does not start settlement polling if cleanup ran while signing or submitting", async () => {
    useSubmitOrder()();
    const submission = vi.mocked(executeOrder).mock.calls[0]![0];
    const started = hooks.store!.getState().beginExecution({})!;
    hooks.cleanup!();

    await expect(submission.waitForOrderFill!(order, started.executionId))
      .rejects.toThrow("Swap tracking stopped");
    expect(hooks.fetch).not.toHaveBeenCalled();
  });

  it("keeps the original controller when a duplicate submit is attempted", async () => {
    const submit = useSubmitOrder();
    submit();
    const submission = vi.mocked(executeOrder).mock.calls[0]![0];
    const started = hooks.store!.getState().beginExecution({})!;
    hooks.store!.getState().replaceExecution(started.executionId, {
      ...started, phase: ExecutionPhase.SIGNING,
    });
    submit();
    expect(executeOrder).toHaveBeenCalledOnce();

    hooks.cleanup!();
    await expect(submission.waitForOrderFill!(order, started.executionId))
      .rejects.toThrow("Swap tracking stopped");
    expect(hooks.fetch).not.toHaveBeenCalled();
  });
});

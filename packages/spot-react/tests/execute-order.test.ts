import { ExecutionPhase } from "@orbs-network/spot-ui";
import { describe,expect,it } from "vitest";
import { createSpotStore } from "../src/store/create-store";
const APPROVE_HASH = `0x${"33".repeat(32)}` as `0x${string}`;

describe("execution store", () => {
  it("rejects resets and duplicate starts while an execution is active", () => {
    const store = createSpotStore({ tradeCount: 5 });
    const first = store.getState().beginExecution({});

    expect(first?.phase).toBe(ExecutionPhase.PREPARING);
    expect(store.getState().returnToOrderForm()).toBe(false);
    expect(store.getState().startNewOrder({ tradeCount: 1 })).toBe(false);
    expect(store.getState().beginExecution({})).toBeUndefined();
    expect(store.getState().state.currentExecution).toBe(first);
  });

  it("ignores stale writes from an older execution attempt", () => {
    const store = createSpotStore({});
    const first = store.getState().beginExecution({});
    expect(first?.executionId).toBeDefined();
    expect(
      store.getState().replaceExecution(first!.executionId!, {
        ...first!,
        phase: ExecutionPhase.FAILED,
        error: new Error("failed"),
        parsedError: { message: "failed", code: 0 },
      }),
    ).toBe(true);

    const second = store.getState().beginExecution({});
    expect(second?.executionId).toBeDefined();
    expect(second?.executionId).not.toBe(first?.executionId);
    expect(
      store.getState().replaceExecution(first!.executionId!, {
        ...first!,
        phase: ExecutionPhase.FAILED,
        error: new Error("failed"),
        parsedError: { message: "failed", code: 0 },
      }),
    ).toBe(false);
    expect(store.getState().state.currentExecution).toBe(second);
  });

  it("replaces terminal retry state instead of merging old progress", () => {
    const store = createSpotStore({});
    const first = store.getState().beginExecution({});
    expect(
      store.getState().replaceExecution(first!.executionId!, {
        ...first!,
        phase: ExecutionPhase.FAILED,
        error: new Error("first attempt"),
        parsedError: { message: "first attempt", code: 10 },
        approveTxHash: APPROVE_HASH,
        orderId: "old-order",
        stepIndex: 2,
      }),
    ).toBe(true);

    const retry = store.getState().beginExecution({});
    expect(retry?.phase).toBe(ExecutionPhase.PREPARING);
    expect(retry?.error).toBeUndefined();
    expect(retry?.parsedError).toBeUndefined();
    expect(retry?.approveTxHash).toBeUndefined();
    expect(retry?.orderId).toBeUndefined();
    expect(retry?.stepIndex).toBeUndefined();
  });
});

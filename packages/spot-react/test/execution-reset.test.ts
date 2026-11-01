import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpotStore } from "../src/context/create-spot-store";
import { ExecutionPhase, type CompletedWrap, type SwapExecution } from "../src/types";

vi.mock("@orbs-network/spot-ui", async () => import("../../spot-ui/src/index"));

type SpotStore = ReturnType<typeof createSpotStore>;
type TerminalPhase = ExecutionPhase.FAILED | ExecutionPhase.REJECTED | ExecutionPhase.SUCCESS;

const terminalPhases: TerminalPhase[] = [ExecutionPhase.FAILED, ExecutionPhase.REJECTED, ExecutionPhase.SUCCESS];
const firstWrap: CompletedWrap = {
  account: "0x0000000000000000000000000000000000000001",
  chainId: 56,
  inputTokenAddress: "0x0000000000000000000000000000000000000002",
  inputAmountRaw: "100",
  txHash: "0xfirstwrap",
};
const secondWrap: CompletedWrap = { ...firstWrap, txHash: "0xsecondwrap" };

const transition = (store: SpotStore, executionId: number, phase: ExecutionPhase): void => {
  expect(store.getState().replaceExecution(executionId, {
    ...store.getState().state.currentExecution,
    phase,
  })).toBe(true);
};

const finishAttempt = (
  store: SpotStore,
  phase: TerminalPhase,
  metadata: Omit<SwapExecution, "executionId" | "phase"> = {},
): number => {
  const execution = store.getState().beginExecution(metadata);
  if (!execution) throw new Error("Expected execution to start");
  if (phase === ExecutionPhase.SUCCESS) {
    transition(store, execution.executionId, ExecutionPhase.SIGNING);
    transition(store, execution.executionId, ExecutionPhase.SUBMITTING);
  }
  transition(store, execution.executionId, phase);
  return execution.executionId;
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("execution-bound dialog resets", () => {
  it.each(terminalPhases)("keeps a newer %s attempt when an old failure dismiss finishes", async (phase) => {
    const store = createSpotStore({ tradeCount: 3, limitPriceUi: "20", isMarketOrder: false });
    const firstId = finishAttempt(store, ExecutionPhase.FAILED, {
      completedWrap: firstWrap, error: new Error("First attempt expired"),
    });
    let dismissed: boolean | undefined;
    setTimeout(() => { dismissed = store.getState().returnToOrderForm(firstId); }, 200);

    const secondError = phase === ExecutionPhase.SUCCESS ? undefined : new Error("Current attempt failed");
    const secondId = finishAttempt(store, phase, {
      completedWrap: secondWrap,
      error: secondError,
      orderId: "0xsecondorder",
      approveTxHash: "0xsecondapproval",
    });
    store.getState().updateState({ tradeCount: 7, limitPriceUi: "30", triggerPriceUi: "40", isPriceInverted: true });
    const currentState = store.getState().state;

    await vi.advanceTimersByTimeAsync(200);
    expect(dismissed).toBe(false);
    expect(store.getState().state).toBe(currentState);
    expect(store.getState().state.currentExecution).toMatchObject({
      executionId: secondId, phase, completedWrap: secondWrap, error: secondError, orderId: "0xsecondorder",
    });
  });

  it.each(terminalPhases)("keeps a newer %s attempt when an old success reset finishes", async (phase) => {
    const store = createSpotStore({ tradeCount: 3, limitPriceUi: "20", isMarketOrder: false });
    const firstId = finishAttempt(store, ExecutionPhase.SUCCESS, { completedWrap: firstWrap });
    let reset: boolean | undefined;
    setTimeout(() => { reset = store.getState().startNewOrder({ tradeCount: 1, limitPriceUi: "old" }, firstId); }, 200);
    expect(store.getState().startNewOrder({ tradeCount: 5, limitPriceUi: "fresh" }, firstId)).toBe(true);

    const secondError = phase === ExecutionPhase.SUCCESS ? undefined : new Error("New terminal attempt");
    const secondId = finishAttempt(store, phase, { completedWrap: secondWrap, error: secondError });
    store.getState().updateState({ triggerPriceUi: "90", isPriceInverted: true });
    const currentState = store.getState().state;

    await vi.advanceTimersByTimeAsync(200);
    expect(reset).toBe(false);
    expect(store.getState().state).toBe(currentState);
    expect(store.getState().state.currentExecution).toMatchObject({
      executionId: secondId, phase, completedWrap: secondWrap, error: secondError,
    });
  });

  it.each(["dismiss", "startNew"] as const)("ignores an idle %s callback after a numbered attempt begins", async (action) => {
    const store = createSpotStore({ tradeCount: 3 });
    const originatingId = store.getState().state.currentExecution.executionId;
    let reset: boolean | undefined;
    setTimeout(() => {
      reset = action === "dismiss"
        ? store.getState().returnToOrderForm(originatingId)
        : store.getState().startNewOrder({ tradeCount: 1 }, originatingId);
    }, 200);
    finishAttempt(store, ExecutionPhase.FAILED, { completedWrap: secondWrap, error: new Error("Current failure") });
    const currentState = store.getState().state;

    await vi.advanceTimersByTimeAsync(200);
    expect(reset).toBe(false);
    expect(store.getState().state).toBe(currentState);
  });

  it.each(["dismiss", "startNew"] as const)("preserves an edited idle form when an old numbered %s callback finishes", async (action) => {
    const store = createSpotStore({ tradeCount: 3, limitPriceUi: "20" });
    const executionId = finishAttempt(store, action === "dismiss" ? ExecutionPhase.FAILED : ExecutionPhase.SUCCESS, {
      completedWrap: firstWrap,
    });
    const resetOriginatingAttempt = () => action === "dismiss"
      ? store.getState().returnToOrderForm(executionId)
      : store.getState().startNewOrder({ tradeCount: 1, limitPriceUi: "old" }, executionId);
    let delayedReset: boolean | undefined;
    setTimeout(() => { delayedReset = resetOriginatingAttempt(); }, 200);
    expect(resetOriginatingAttempt()).toBe(true);
    store.getState().updateState({ tradeCount: 9, limitPriceUi: "edited", isMarketOrder: false, isPriceInverted: true });
    const editedState = store.getState().state;

    await vi.advanceTimersByTimeAsync(200);
    expect(delayedReset).toBe(false);
    expect(store.getState().state).toBe(editedState);
  });

  it.each(["dismiss", "startNew"] as const)("allows a matching idle %s callback before any numbered attempt", (action) => {
    const store = createSpotStore({ tradeCount: 3 });
    const reset = action === "dismiss"
      ? store.getState().returnToOrderForm(undefined)
      : store.getState().startNewOrder({ tradeCount: 1 }, undefined);
    expect(reset).toBe(true);
    expect(store.getState().state.tradeCount).toBe(action === "dismiss" ? 3 : 1);
    expect(store.getState().state.currentExecution.phase).toBe(ExecutionPhase.IDLE);
  });

  it.each([ExecutionPhase.FAILED, ExecutionPhase.REJECTED] as const)("dismisses the matching %s attempt while preserving its confirmed wrap and form", (phase) => {
    const store = createSpotStore({ tradeCount: 3, limitPriceUi: "20", isMarketOrder: false });
    store.getState().updateState({ triggerPriceUi: "40", isPriceInverted: true });
    const executionId = finishAttempt(store, phase, {
      completedWrap: firstWrap, error: new Error("Signing failed"), approveTxHash: "0xapproval",
    });

    expect(store.getState().returnToOrderForm(executionId)).toBe(true);
    expect(store.getState().state).toMatchObject({
      tradeCount: 3, limitPriceUi: "20", triggerPriceUi: "40", isMarketOrder: false, isPriceInverted: true,
      currentExecution: { phase: ExecutionPhase.IDLE, completedWrap: firstWrap },
    });
    expect(store.getState().state.currentExecution).not.toHaveProperty("error");
    expect(store.getState().state.currentExecution).not.toHaveProperty("executionId");
    expect(store.getState().state.currentExecution).not.toHaveProperty("approveTxHash");
  });

  it("starts a new order for the matching success using defaults and the current market mode", () => {
    const store = createSpotStore({ tradeCount: 3, limitPriceUi: "20", isMarketOrder: true });
    store.getState().updateState({ triggerPriceUi: "40", isPriceInverted: true });
    const executionId = finishAttempt(store, ExecutionPhase.SUCCESS, { completedWrap: firstWrap, orderId: "0xcompleted" });

    expect(store.getState().returnToOrderForm(executionId)).toBe(false);
    expect(store.getState().startNewOrder({ tradeCount: 1, limitPriceUi: "50", isMarketOrder: false }, executionId)).toBe(true);
    expect(store.getState().state).toMatchObject({
      tradeCount: 1, limitPriceUi: "50", triggerPriceUi: undefined, isPriceInverted: undefined, isMarketOrder: true,
    });
    expect(store.getState().state.currentExecution).toEqual({ phase: ExecutionPhase.IDLE, completedWrap: undefined });
  });

  it.each([
    ExecutionPhase.PREPARING, ExecutionPhase.WRAPPING, ExecutionPhase.APPROVING,
    ExecutionPhase.SIGNING, ExecutionPhase.SUBMITTING, ExecutionPhase.SETTLING, ExecutionPhase.UNCONFIRMED,
  ])(
    "keeps a matching %s attempt locked against both reset actions",
    (phase) => {
      const store = createSpotStore({ tradeCount: 3 });
      const execution = store.getState().beginExecution({ completedWrap: firstWrap });
      if (!execution) throw new Error("Expected execution to start");
      const phases = phase === ExecutionPhase.PREPARING ? []
        : phase === ExecutionPhase.WRAPPING || phase === ExecutionPhase.APPROVING ? [phase]
        : phase === ExecutionPhase.SIGNING ? [ExecutionPhase.SIGNING]
        : phase === ExecutionPhase.SUBMITTING ? [ExecutionPhase.SIGNING, ExecutionPhase.SUBMITTING]
        : [ExecutionPhase.SIGNING, ExecutionPhase.SUBMITTING, phase];
      for (const nextPhase of phases) transition(store, execution.executionId, nextPhase);
      const currentState = store.getState().state;

      expect(store.getState().returnToOrderForm(execution.executionId)).toBe(false);
      expect(store.getState().startNewOrder({ tradeCount: 1 }, execution.executionId)).toBe(false);
      expect(store.getState().state).toBe(currentState);
    },
  );
});

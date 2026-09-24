import type { ExecutionController } from "./execute-order";
import {
  canBeginExecution,
  canTransitionExecution,
  createIdleExecution,
  isExecutionActive,
} from "./execution-state";
import { ExecutionPhase, type SwapExecution } from "./types";

export interface ExecutionStateBinding {
  get: () => SwapExecution;
  set: (execution: SwapExecution) => void;
}

/** Framework-neutral state owner, optionally bound to a host's external store. */
export const createExecutionController = (
  binding?: ExecutionStateBinding,
): ExecutionController & {
  returnToOrderForm: () => boolean;
} => {
  let current = createIdleExecution();
  let nextExecutionId = 0;
  const get = binding?.get ?? (() => current);
  const set =
    binding?.set ??
    ((value: SwapExecution) => {
      current = value;
    });
  return {
    getCurrentExecution: get,
    beginExecution: (value) => {
      if (!canBeginExecution(get().phase)) return undefined;
      const started = {
        ...value,
        phase: ExecutionPhase.PREPARING as const,
        executionId: ++nextExecutionId,
      };
      set(started);
      return started;
    },
    replaceExecution: (executionId, value) => {
      const previous = get();
      if (
        previous.executionId !== executionId ||
        value.executionId !== executionId ||
        !canTransitionExecution(previous.phase, value.phase)
      )
        return false;
      set(value);
      return true;
    },
    returnToOrderForm: () => {
      const previous = get();
      if (
        isExecutionActive(previous.phase) ||
        previous.phase === ExecutionPhase.SUCCESS
      )
        return false;
      set(createIdleExecution(previous.completedWrap));
      return true;
    },
  };
};

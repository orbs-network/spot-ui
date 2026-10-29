import {
  ExecutionPhase,
  Steps,
  ExecutionStatus,
  type CompletedWrap,
  type SwapExecution,
} from "./types";
import { OrderSettlementError, SpotError } from "@orbs-network/spot-ui";

export { getErrorMessage, normalizeError, parseExecutionError } from "./parse-execution-error";

const ACTIVE_PHASES = new Set<ExecutionPhase>([
  ExecutionPhase.PREPARING,
  ExecutionPhase.WRAPPING,
  ExecutionPhase.APPROVING,
  ExecutionPhase.SIGNING,
  ExecutionPhase.SUBMITTING,
  ExecutionPhase.SETTLING,
]);

const ALLOWED_TRANSITIONS: Record<ExecutionPhase, ReadonlySet<ExecutionPhase>> = {
  [ExecutionPhase.IDLE]: new Set(),
  [ExecutionPhase.PREPARING]: new Set([
    ExecutionPhase.PREPARING,
    ExecutionPhase.WRAPPING,
    ExecutionPhase.APPROVING,
    ExecutionPhase.SIGNING,
    ExecutionPhase.FAILED,
    ExecutionPhase.REJECTED,
  ]),
  [ExecutionPhase.WRAPPING]: new Set([
    ExecutionPhase.WRAPPING,
    ExecutionPhase.APPROVING,
    ExecutionPhase.SIGNING,
    ExecutionPhase.FAILED,
    ExecutionPhase.REJECTED,
  ]),
  [ExecutionPhase.APPROVING]: new Set([
    ExecutionPhase.APPROVING,
    ExecutionPhase.SIGNING,
    ExecutionPhase.FAILED,
    ExecutionPhase.REJECTED,
  ]),
  [ExecutionPhase.SIGNING]: new Set([
    ExecutionPhase.SIGNING,
    ExecutionPhase.SUBMITTING,
    ExecutionPhase.FAILED,
    ExecutionPhase.REJECTED,
  ]),
  [ExecutionPhase.SUBMITTING]: new Set([
    ExecutionPhase.SETTLING,
    ExecutionPhase.SUCCESS,
    ExecutionPhase.FAILED,
    ExecutionPhase.REJECTED,
    ExecutionPhase.UNCONFIRMED,
  ]),
  [ExecutionPhase.SETTLING]: new Set([
    ExecutionPhase.SETTLING,
    ExecutionPhase.SUCCESS,
    ExecutionPhase.FAILED,
    ExecutionPhase.UNCONFIRMED,
  ]),
  [ExecutionPhase.UNCONFIRMED]: new Set([
    ExecutionPhase.SETTLING,
    ExecutionPhase.SUCCESS,
    ExecutionPhase.FAILED,
  ]),
  [ExecutionPhase.SUCCESS]: new Set(),
  [ExecutionPhase.FAILED]: new Set(),
  [ExecutionPhase.REJECTED]: new Set(),
};

export const createIdleExecution = (
  completedWrap?: CompletedWrap,
): SwapExecution => ({
  phase: ExecutionPhase.IDLE,
  completedWrap,
});

export const isExecutionActive = (phase: ExecutionPhase): boolean =>
  ACTIVE_PHASES.has(phase);

/** An uncertain intent must be reconciled before its state can be reset or replaced. */
export const isExecutionLocked = (phase: ExecutionPhase): boolean =>
  isExecutionActive(phase) || phase === ExecutionPhase.UNCONFIRMED;

export const canBeginExecution = (phase: ExecutionPhase): boolean =>
  phase === ExecutionPhase.IDLE ||
  phase === ExecutionPhase.FAILED ||
  phase === ExecutionPhase.REJECTED;

/** A stopped lookup or lost submission response does not establish that the order failed. */
export const isUnconfirmedExecutionError = (error: unknown, phase: ExecutionPhase): boolean => {
  if (phase === ExecutionPhase.SETTLING) {
    return !(error instanceof OrderSettlementError && (error.reason === "cancelled" || error.reason === "expired"));
  }
  if (phase !== ExecutionPhase.SUBMITTING) return false;
  if (error instanceof SpotError && error.code === "SUBMISSION_FAILED" &&
      error.status !== undefined && error.status < 500 && error.status !== 408 && !error.cause) {
    return false;
  }
  return true;
};

export const canTransitionExecution = (
  from: ExecutionPhase,
  to: ExecutionPhase,
): boolean => ALLOWED_TRANSITIONS[from].has(to);

export const getExecutionStatus = (
  phase: ExecutionPhase,
): ExecutionStatus | undefined => {
  if (isExecutionActive(phase)) return ExecutionStatus.LOADING;
  if (phase === ExecutionPhase.SUCCESS) return ExecutionStatus.SUCCESS;
  if (phase === ExecutionPhase.FAILED || phase === ExecutionPhase.REJECTED || phase === ExecutionPhase.UNCONFIRMED) {
    return ExecutionStatus.FAILED;
  }
  return undefined;
};

export const getExecutionStep = (phase: ExecutionPhase): Steps | undefined => {
  if (phase === ExecutionPhase.WRAPPING) return Steps.WRAP;
  if (phase === ExecutionPhase.APPROVING) return Steps.APPROVE;
  if (
    phase === ExecutionPhase.SIGNING ||
    phase === ExecutionPhase.SUBMITTING
  ) {
    return Steps.CREATE;
  }
  return undefined;
};

export const observe = (callback: (() => unknown) | undefined): void => {
  if (!callback) return;
  try {
    const result = callback();
    void Promise.resolve(result).catch(() => undefined);
  } catch {
    // Observational callbacks must never alter the transaction result.
  }
};

export const getReusableCompletedWrap = ({
  execution,
  account,
  chainId,
  inputTokenAddress,
  inputAmountRaw,
}: {
  execution: SwapExecution;
  account: string;
  chainId: number;
  inputTokenAddress: string;
  inputAmountRaw: string;
}): CompletedWrap | undefined => {
  const completedWrap = execution.completedWrap;
  if (
    completedWrap?.account.toLowerCase() === account.toLowerCase() &&
    completedWrap.chainId === chainId &&
    completedWrap.inputTokenAddress.toLowerCase() ===
      inputTokenAddress.toLowerCase() &&
    hasEnoughWrappedAmount(completedWrap.inputAmountRaw, inputAmountRaw)
  ) {
    return completedWrap;
  }
  return undefined;
};

const hasEnoughWrappedAmount = (
  completedAmountWei: string,
  requestedAmountWei: string,
): boolean => {
  try {
    return BigInt(completedAmountWei) >= BigInt(requestedAmountWei);
  } catch {
    return false;
  }
};

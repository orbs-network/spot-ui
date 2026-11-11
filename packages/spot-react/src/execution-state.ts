import {
  ExecutionPhase,
  Steps,
  ExecutionStatus,
  type CompletedWrap,
  type OrderExecutionState,
} from "./types";
import { OrderSettlementError, SpotError } from "@orbs-network/spot-ui";

export { getErrorMessage, normalizeError, parseExecutionError } from "./parse-execution-error";

/** Internal cancellation for an obsolete wallet/form scope, rather than a failed order. */
export class ExecutionScopeChangedError extends Error {
  readonly name = "ExecutionScopeChangedError";

  constructor(message = "The wallet account, network, or partner changed") {
    super(message);
  }
}

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
    ExecutionPhase.IDLE,
    ExecutionPhase.PREPARING,
    ExecutionPhase.WRAPPING,
    ExecutionPhase.APPROVING,
    ExecutionPhase.SIGNING,
    ExecutionPhase.FAILED,
    ExecutionPhase.REJECTED,
  ]),
  [ExecutionPhase.WRAPPING]: new Set([
    ExecutionPhase.IDLE,
    ExecutionPhase.PREPARING,
    ExecutionPhase.WRAPPING,
    ExecutionPhase.APPROVING,
    ExecutionPhase.SIGNING,
    ExecutionPhase.FAILED,
    ExecutionPhase.REJECTED,
  ]),
  [ExecutionPhase.APPROVING]: new Set([
    ExecutionPhase.IDLE,
    ExecutionPhase.PREPARING,
    ExecutionPhase.APPROVING,
    ExecutionPhase.SIGNING,
    ExecutionPhase.FAILED,
    ExecutionPhase.REJECTED,
  ]),
  [ExecutionPhase.SIGNING]: new Set([
    ExecutionPhase.IDLE,
    ExecutionPhase.SIGNING,
    ExecutionPhase.SUBMITTING,
    ExecutionPhase.FAILED,
    ExecutionPhase.REJECTED,
  ]),
  [ExecutionPhase.SUBMITTING]: new Set([
    ExecutionPhase.IDLE,
    ExecutionPhase.SUBMITTING,
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
): OrderExecutionState => ({
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
  // The SDK's deadline check fails before it sends the order to the service.
  if (error instanceof SpotError && error.code === "ORDER_EXPIRED") return false;
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

export const getMatchingCompletedWrap = ({
  execution,
  account,
  chainId,
  inputTokenAddress,
  wrappedTokenAddress,
  inputAmountRaw,
}: {
  execution: OrderExecutionState;
  account: string;
  chainId: number;
  inputTokenAddress: string;
  wrappedTokenAddress: string;
  inputAmountRaw: string;
}): CompletedWrap | undefined => {
  const completedWrap = execution.completedWrap;
  if (
    completedWrap?.account.toLowerCase() === account.toLowerCase() &&
    completedWrap.chainId === chainId &&
    completedWrap.inputAmountRaw === inputAmountRaw &&
    completedWrap.inputTokenAddress.toLowerCase() === inputTokenAddress.toLowerCase() &&
    completedWrap.wrappedTokenAddress.toLowerCase() ===
      wrappedTokenAddress.toLowerCase()
  ) {
    return completedWrap;
  }
  return undefined;
};

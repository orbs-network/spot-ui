import {
  ExecutionPhase,
  Steps,
  ExecutionStatus,
  type CompletedWrap,
  type ParsedError,
  type SwapExecution,
} from "./types";

const ACTIVE_PHASES = new Set<ExecutionPhase>([
  ExecutionPhase.PREPARING,
  ExecutionPhase.WRAPPING,
  ExecutionPhase.APPROVING,
  ExecutionPhase.SIGNING,
  ExecutionPhase.SUBMITTING,
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
    ExecutionPhase.SUCCESS,
    ExecutionPhase.FAILED,
    ExecutionPhase.REJECTED,
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

export const canBeginExecution = (phase: ExecutionPhase): boolean =>
  phase === ExecutionPhase.IDLE ||
  phase === ExecutionPhase.FAILED ||
  phase === ExecutionPhase.REJECTED;

export const canTransitionExecution = (
  from: ExecutionPhase,
  to: ExecutionPhase,
): boolean => ALLOWED_TRANSITIONS[from].has(to);

export const getExecutionStatus = (
  phase: ExecutionPhase,
): ExecutionStatus | undefined => {
  if (isExecutionActive(phase)) return ExecutionStatus.LOADING;
  if (phase === ExecutionPhase.SUCCESS) return ExecutionStatus.SUCCESS;
  if (phase === ExecutionPhase.FAILED || phase === ExecutionPhase.REJECTED) {
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

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const message = Reflect.get(error, "message");
    if (typeof message === "string") return message;
  }
  return "Unknown error";
};

const getErrorCode = (error: unknown): number => {
  if (typeof error !== "object" || error === null) return 0;
  const code = Reflect.get(error, "code");
  if (typeof code === "number" && Number.isFinite(code)) return code;
  if (typeof code === "string" && /^-?\d+$/.test(code)) return Number(code);
  return 0;
};

export const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(getErrorMessage(error));

export const parseExecutionError = (error: unknown): ParsedError => {
  const input = getErrorMessage(error);
  const codeMatch = input.match(/,\s*code\s*:\s*(-?\d+)/i);
  const message = input
    .replace(/^error\s*:/i, "")
    .replace(/,\s*code\s*:\s*-?\d+/i, "")
    .trim();

  return {
    message: message || "Unknown error",
    code: getErrorCode(error) || (codeMatch ? Number(codeMatch[1]) : 0),
  };
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
  inputAmountWei,
}: {
  execution: SwapExecution;
  account: string;
  chainId: number;
  inputTokenAddress: string;
  inputAmountWei: string;
}): CompletedWrap | undefined => {
  const completedWrap = execution.completedWrap;
  if (
    completedWrap?.account.toLowerCase() === account.toLowerCase() &&
    completedWrap.chainId === chainId &&
    completedWrap.inputTokenAddress.toLowerCase() ===
      inputTokenAddress.toLowerCase() &&
    hasEnoughWrappedAmount(completedWrap.inputAmountWei, inputAmountWei)
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

import type { PreparedOrder } from "../client/types";
import type { CalculatedOrderForm } from "../order-form/types";
import type { Address, Token } from "../shared/types";

export enum ExecutionStatus {
  LOADING = 1,
  SUCCESS = 2,
  FAILED = 3,
}

export enum ExecutionPhase {
  IDLE = "idle",
  PREPARING = "preparing",
  WRAPPING = "wrapping",
  APPROVING = "approving",
  SIGNING = "signing",
  SUBMITTING = "submitting",
  SUCCESS = "success",
  FAILED = "failed",
  REJECTED = "rejected",
}

export type OnApproveSuccessCallback = {
  txHash: string;
  token: Token;
  amount: string;
};

export type OnWrapSuccessCallback = {
  txHash: string;
  amount: string;
};

export type ParsedError = {
  message: string;
  code: number;
};

export type ObserverResult = void | PromiseLike<unknown>;

export enum Steps {
  WRAP = "wrap",
  APPROVE = "approve",
  CREATE = "create",
}

export interface CompletedWrap {
  account: Address;
  chainId: number;
  inputTokenAddress: string;
  inputAmountRaw: string;
  txHash: string;
}

export interface ExecutionDetails {
  parsedError?: ParsedError;
  error?: Error;
  stepIndex?: number;
  approveTxHash?: string;
  wrapTxHash?: string;
  totalSteps?: number;
  pendingSteps?: Steps[];
  inputToken?: Token;
  outputToken?: Token;
  chainId?: number;
  orderId?: string;
  hasApproval?: boolean;
  form?: CalculatedOrderForm;
  preparedOrder?: PreparedOrder;
  completedWrap?: CompletedWrap;
}

export type SwapExecution = ExecutionDetails &
  (
    | { phase: ExecutionPhase.IDLE; executionId?: never }
    | { phase: ExecutionPhase.PREPARING; executionId: number }
    | {
        phase:
          | ExecutionPhase.WRAPPING
          | ExecutionPhase.APPROVING
          | ExecutionPhase.SIGNING
          | ExecutionPhase.SUBMITTING;
        executionId: number;
      }
    | { phase: ExecutionPhase.SUCCESS; executionId: number; orderId: string }
    | {
        phase: ExecutionPhase.FAILED | ExecutionPhase.REJECTED;
        executionId: number;
        error: Error;
        parsedError: ParsedError;
      }
  );

export type StartedSwapExecution = Extract<
  SwapExecution,
  { phase: ExecutionPhase.PREPARING }
>;

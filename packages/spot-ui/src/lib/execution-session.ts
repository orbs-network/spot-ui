import type { PreparedOrder } from "./client";
import type { OrderExecutionUpdate, SignableOrder } from "./execute-order";
import type { PreparedSwap } from "./swap";
import type { DeepReadonly, Hex, Order } from "./types";

export interface ExecutionRunOptions<T extends SignableOrder = PreparedOrder> {
  /** Observe this run; observer errors and rejected promises never stop execution. */
  onProgress?: (update: OrderExecutionUpdate<T>) => void;
}

export type TransactionStepResult =
  | { readonly status: "skipped" }
  | { readonly status: "success"; readonly txHash: Hex };

/** A reviewed intent whose wallet steps can be driven individually or through run(). */
export interface OrderExecution<T extends SignableOrder = PreparedOrder> {
  /** Latest accepted or settled order. Snapshots are immutable and stable until the next update. */
  readonly order: DeepReadonly<Order> | undefined;
  /** Exact immutable payload captured immediately before signing. */
  readonly preparedOrder: DeepReadonly<T> | undefined;
  readonly signature: Hex | undefined;
  readonly wrapTxHash: Hex | undefined;
  readonly approvalTxHash: Hex | undefined;
  /** Fresh check of pending wrapping; false once complete. Does not start or advance execution. */
  shouldWrap(): Promise<boolean>;
  /** Fresh check of the captured approval request; false once complete. Does not advance execution. */
  shouldApprove(): Promise<boolean>;
  /** Ask shouldWrap(); false produces a cached skipped result without a wallet write. */
  wrap(): Promise<TransactionStepResult>;
  /** Use run()'s pre-wrap allowance decision or check it directly; recheck each approval receipt and retry once if needed. */
  approve(): Promise<TransactionStepResult>;
  /** Prepare and sign after wrap() and approve() complete or skip. */
  sign(): Promise<Hex>;
  /** Submit the exact signed payload once and resolve at acceptance. */
  submit(): Promise<Order>;
  /** Track an accepted order without signing or submitting again. */
  waitForCompletion(): Promise<Order>;
  /** Run missing wallet steps, submit once, then await settlement for swaps. */
  run(options?: ExecutionRunOptions<T>): Promise<Order>;
  /** Stop later steps or tracking; completed transactions and accepted orders remain valid. */
  cancel(reason?: unknown): void;
}

/** Quote-based swap execution; run() resolves after confirmed settlement. */
export type SwapExecution = OrderExecution<PreparedSwap>;

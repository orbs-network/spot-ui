import type { PreparedOrder } from "@orbs-network/spot-ui";
import type { OrderExecutionUpdate, SignableOrder } from "./progress";
import type { PreparedSwap } from "@orbs-network/spot-ui";
import type { DeepReadonly, Hex, Order } from "@orbs-network/spot-ui";

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
  /** Original wallet signature retained after sign() completes. */
  readonly signature: Hex | undefined;
  /** Confirmed wrapping transaction hash, retained even if a later step fails. */
  readonly wrapTxHash: Hex | undefined;
  /** Latest confirmed approval hash; sufficient allowance is verified separately. */
  readonly approvalTxHash: Hex | undefined;
  /**
   * Ask the host whether this reviewed input still needs native wrapping.
   * Reads the current requirement without opening a wallet or advancing execution.
   *
   * @returns True when wrapping is required; false after wrapping, signing, or submission completes.
   */
  shouldWrap(): Promise<boolean>;
  /**
   * Ask the host whether allowance covers this execution's exact input amount.
   * Uses the captured token and spender without requesting an approval transaction.
   *
   * @returns True when approval is required; false after approval, signing, or submission completes.
   */
  shouldApprove(): Promise<boolean>;
  /**
   * Check the wrapping requirement and, when needed, confirm the native wrapping transaction.
   * Use before approve() when driving wallet steps manually. Repeated calls reuse this step's promise.
   *
   * @returns A skipped result when wrapping is unnecessary, or success with the confirmed transaction hash.
   */
  wrap(): Promise<TransactionStepResult>;
  /**
   * Confirm sufficient ERC-20 allowance before signing.
   * Checks allowance directly when called manually; run() can reuse its pre-wrap decision.
   * After each approval receipt, checks allowance again and retries approval once if needed.
   *
   * @returns A skipped result for sufficient allowance, or success with the confirmed approval hash.
   * @throws If required wrapping is incomplete, allowance remains insufficient after retry, or a wallet/read operation fails.
   */
  approve(): Promise<TransactionStepResult>;
  /**
   * Prepare fresh order timestamps and ask the host wallet to sign the exact EIP-712 payload.
   * Call after required wrap() and approve() steps. Missing prerequisites are checked and skipped only when unnecessary.
   * Stores the immutable preparedOrder and original signature for submit(); repeated calls reuse the signing promise.
   *
   * @returns The original wallet signature without rewriting its bytes.
   * @throws If a required wallet step is incomplete, the order expires, or preparation/signing fails.
   */
  sign(): Promise<Hex>;
  /**
   * Submit the order and signature retained by sign().
   * Resolves when the service accepts the order, including for swaps; use waitForCompletion() to track fills.
   * Repeated calls reuse the original promise, including after uncertain acceptance, and never send another POST.
   *
   * @returns The accepted order, also available through this execution's order getter.
   * @throws If sign() is incomplete, the order has expired, or submission fails.
   */
  submit(): Promise<Order>;
  /**
   * Track the order accepted by submit() until it fills completely.
   * Retains accepted/latest order snapshots while checking status; performs no new signing or submission.
   *
   * @returns The completed order, also retained by this execution's order getter.
   * @throws If submission is incomplete, tracking is unavailable, or settlement fails or is cancelled.
   */
  waitForCompletion(): Promise<Order>;
  /**
   * Run the remaining wrapping, approval, signing, and submission steps for this reviewed intent.
   * Checks initial allowance before opening the wrap wallet prompt. Completed steps are reused.
   * Swaps await completion; advanced orders resolve at acceptance. Repeated calls share the same run promise.
   *
   * @param options - Optional progress observer; observer errors do not interrupt execution.
   * @returns The completed swap or accepted advanced order.
   *
   * @example
   * const order = await execution.run({ onProgress: update => setProgress(update) });
   */
  run(options?: ExecutionRunOptions<T>): Promise<Order>;
  /**
   * Stop subsequent wallet steps or order tracking when the reviewed intent becomes obsolete.
   * Cannot undo confirmed transactions, close an open wallet prompt, or cancel an accepted order.
   * A submission already sent can still return acceptance, which remains available through order.
   *
   * @param reason - Optional error or other value used to reject interrupted execution work.
   */
  cancel(reason?: unknown): void;
}

/** Quote-based swap execution; run() resolves after confirmed settlement. */
export type SwapExecution = OrderExecution<PreparedSwap>;

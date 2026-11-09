import type { AllowanceRequest, ApprovalRequest, OrderSigningRequest, PreparedOrder, SpotClient } from "./client";
import type { Order } from "./types";
import { SpotError } from "./errors";
import { observe } from "./observe";
import { bindOrderAnalytics, bindSubmittedOrderAnalytics, resolveAnalyticsReporter, type SpotAnalytics } from "./analytics";

/** Current stage before an order has been accepted by the order service. */
export type OrderExecutionPhase = "preparing" | "wrapping" | "approving" | "signing" | "submitting";
/** Wallet steps required for this execution; `create` covers signing and submission. */
export type OrderExecutionStep = "wrap" | "approve" | "create";
/** Framework-neutral wallet adapter implemented by the host application. */
export interface OrderWalletInteractions {
  /** Wrap native input in base units and resolve with the hash after a successful receipt. */
  wrapNativeToken(amountRaw: string): Promise<`0x${string}`>;
  /** Approve the requested raw ERC-20 amount and resolve after a successful receipt. */
  approveToken(request: ApprovalRequest): Promise<`0x${string}`>;
  /** Read the connected account's current allowance as an integer string in token base units. */
  getAllowance(request: AllowanceRequest): Promise<string>;
  /** Read the connected account's ERC-20 balance on this chain as integer base units. Required to reuse a completed native wrap. */
  getTokenBalance?(request: { tokenAddress: string }): Promise<string>;
  /** Sign the supplied EIP-712 data and return the original wallet signature unchanged. */
  signOrder(request: OrderSigningRequest): Promise<`0x${string}`>;
}
/** Minimum prepared payload needed to sign an order and validate its spending requirements. */
export interface SignableOrder extends Pick<PreparedOrder, "order" | "signingRequest" | "approvalRequest"> {}
/** Snapshot of submission progress; settlement is tracked separately with `watchOrder`. */
export interface OrderExecutionUpdate<T extends SignableOrder> {
  phase: OrderExecutionPhase;
  event: "request" | "transaction" | "success" | "prepared" | "error";
  error?: unknown;
  steps: OrderExecutionStep[];
  /** Zero-based current step, advanced when a wallet step succeeds. */
  stepIndex: number;
  /** Whether the required ERC-20 allowance has been confirmed. */
  hasApproval: boolean;
  /** Actual native amount requested for wrapping in this attempt, including a retry's shortfall. */
  wrapAmountRaw?: string;
  wrapTxHash?: string;
  approvalTxHash?: string;
  preparedOrder?: T;
  signature?: `0x${string}`;
}
/** Reviewed spending inputs and wallet adapter for {@link executeOrder}. */
export interface ExecuteOrderParams<T extends SignableOrder> {
  /** Reused client supplying the configured spender, submission, and analytics. */
  client: Pick<SpotClient, "spenderAddress" | "submitOrder" | "analytics"> &
    Partial<Pick<SpotClient, "chainId" | "partner">>;
  /** Connected account that must match the prepared order's signer. */
  account: string;
  /** ERC-20 input address; use the wrapped token address for native input. */
  inputTokenAddress: string;
  /** Reviewed positive input amount as an integer string in token base units. */
  inputAmountRaw: string;
  /** Wrap native input before signing; a verified retry wraps only its current wrapped-token shortfall. Defaults to false. */
  nativeInput?: boolean;
  /** Candidate confirmed wrap for this account/chain/token; live balance is checked before reuse. */
  completedWrapTxHash?: string;
  /** Host wallet operations with confirmed receipts for wrapping and approvals. */
  walletInteractions: OrderWalletInteractions;
  /** Called after wrapping/approval, immediately before signing, to create fresh order timestamps. */
  prepareOrder: () => T | Promise<T>;
  /** Stops later steps; it cannot undo wallet transactions or an accepted submission. */
  signal?: AbortSignal;
  /** Host context validation; called again before every wallet write and submission. */
  validateContext?: () => void;
  /** Optional progress observer. Thrown errors or rejected promises are ignored. */
  onUpdate?: (update: OrderExecutionUpdate<T>) => void;
  /** Operation reporter shared with preparation, submission, and settlement. */
  analytics?: SpotAnalytics;
  /** Optional delay implementation for allowance retries; defaults to a timer. */
  wait?: (milliseconds: number) => Promise<void>;
}
const locks = new WeakMap<object, Set<string>>();
const ALLOWANCE_ATTEMPTS = 3;
const ALLOWANCE_RETRY_DELAY_MILLIS = 3_000;
const waitFor = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));
const parseRawAmount = (raw: string): bigint => {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new SpotError("INVALID_AMOUNT", "Token balances, allowance, and input amount must be non-negative integer base-unit amounts");
  }
  return BigInt(raw);
};

const acquireExecution = (
  client: object,
  account: string,
  inputAmountRaw: string,
): { key: string; active: Set<string>; inputAmount: bigint } => {
  const key = account.toLowerCase();
  const active = locks.get(client) ?? new Set<string>();
  if (active.has(key)) throw new SpotError("EXECUTION_IN_PROGRESS", "An order execution is already in progress for this account");
  const inputAmount = parseRawAmount(inputAmountRaw);
  if (inputAmount <= BigInt(0)) throw new SpotError("INVALID_AMOUNT", "Input amount must be positive");
  active.add(key);
  locks.set(client, active);
  return { key, active, inputAmount };
};

const getExecutionSteps = (wrapRequired: boolean, approvalRequired: boolean): OrderExecutionStep[] => {
  const steps: OrderExecutionStep[] = [];
  if (wrapRequired) steps.push("wrap");
  if (approvalRequired) steps.push("approve");
  steps.push("create");
  return steps;
};

const verifyAllowance = async (
  hasAllowance: () => Promise<boolean>,
  checkContext: () => void,
  wait: (milliseconds: number) => Promise<void>,
): Promise<void> => {
  // A confirmed receipt can precede the RPC node's updated allowance view.
  for (let attempt = 0; attempt < ALLOWANCE_ATTEMPTS; attempt++) {
    checkContext();
    if (await hasAllowance()) return;
    if (attempt < ALLOWANCE_ATTEMPTS - 1) await wait(ALLOWANCE_RETRY_DELAY_MILLIS);
  }
  throw new SpotError("INSUFFICIENT_ALLOWANCE", "Insufficient allowance to submit the order. Please approve the token first.");
};

const assertReviewedOrder = (
  prepared: SignableOrder,
  params: Pick<ExecuteOrderParams<SignableOrder>, "inputTokenAddress" | "inputAmountRaw">,
  accountKey: string,
  spenderAddress: string,
): void => {
  const approval = prepared.approvalRequest;
  const matchesReview =
    approval.tokenAddress.toLowerCase() === params.inputTokenAddress.toLowerCase() &&
    approval.amount === params.inputAmountRaw &&
    approval.spenderAddress.toLowerCase() === spenderAddress.toLowerCase() &&
    prepared.signingRequest.signerAddress.toLowerCase() === accountKey;
  // Late preparation refreshes timestamps, never the reviewed spending authority.
  if (!matchesReview) {
    throw new SpotError("PREPARED_ORDER_MISMATCH", "Prepared order does not match the reviewed execution");
  }
};

const signBeforeDeadline = async (wallet: OrderWalletInteractions, prepared: SignableOrder): Promise<`0x${string}`> => {
  const deadlineMillis = Number(prepared.order.deadline) * 1000;
  if (!Number.isFinite(deadlineMillis)) throw new SpotError("INVALID_ARGUMENT", "The order must have a finite deadline");
  const expired = () => new SpotError("ORDER_EXPIRED", "Order expired before signing was completed. Please try again.");
  if (Date.now() > deadlineMillis) throw expired();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const expiry = new Promise<never>((_, reject) => {
      const checkDeadline = () => {
        const remaining = deadlineMillis - Date.now();
        if (remaining < 0) {
          reject(expired());
          return;
        }
        // Long-lived orders can exceed the maximum timer delay of about 24 days.
        timeout = setTimeout(checkDeadline, Math.min(remaining + 1, 2_147_483_647));
      };
      checkDeadline();
    });
    const signing = Promise.resolve().then(() => {
      if (Date.now() > deadlineMillis) throw expired();
      return wallet.signOrder(prepared.signingRequest);
    });
    const signature = await Promise.race([signing, expiry]);
    // A suspended tab can receive the wallet result before its expiry timer runs.
    if (Date.now() > deadlineMillis) throw expired();
    return signature;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

/**
 * Runs wrapping, allowance approval, fresh order preparation, signing, and submission.
 * Only missing wallet steps are requested. Concurrent executions for the same account
 * and client are rejected. The prepared order must match the reviewed signer, input
 * token, amount, and client spender. Signing fails if the order deadline passes
 * while waiting for the wallet; a later signature is ignored.
 *
 * @param params - Reviewed spending inputs, reused client, wallet adapter, and late preparation callback.
 * @returns The accepted order, exact prepared payload, and any confirmed transaction hashes.
 * Acceptance does not confirm a fill; use `waitForOrder({ order: result.order })` for settlement.
 * @throws If execution is already active, validation fails, or a wallet/submission step fails.
 * Aborting stops later steps but does not cancel an accepted order or undo a transaction.
 */
export async function executeOrder<T extends SignableOrder>(params: ExecuteOrderParams<T>): Promise<{
  order: Order; preparedOrder: T; wrapTxHash?: string; approvalTxHash?: string;
}> {
  const { client, walletInteractions: wallet, wait = waitFor } = params;
  const analytics = resolveAnalyticsReporter(client.analytics, params.analytics, {
    account: params.account,
    chainId: client.chainId,
    partner: client.partner,
    inputTokenAddress: params.inputTokenAddress,
    inputAmountRaw: params.inputAmountRaw,
  });
  observe(() => analytics.onExecutionRequest({
    account: params.account,
    inputTokenAddress: params.inputTokenAddress,
    inputAmountRaw: params.inputAmountRaw,
  }));
  let acquired: ReturnType<typeof acquireExecution>;
  try {
    acquired = acquireExecution(client, params.account, params.inputAmountRaw);
  } catch (error) {
    observe(() => analytics.onExecutionError(error, "preparing"));
    throw error;
  }
  const { key, active, inputAmount } = acquired;
  const check = () => {
    params.signal?.throwIfAborted();
    params.validateContext?.();
  };
  let update: OrderExecutionUpdate<T> = {
    phase: "preparing", event: "request", steps: [], stepIndex: 0,
    hasApproval: false, wrapTxHash: params.completedWrapTxHash,
  };
  const emit = (changes: Partial<OrderExecutionUpdate<T>>) => {
    update = { ...update, ...changes };
    observe(() => params.onUpdate?.({ ...update, steps: [...update.steps] }));
  };
  const allowance = async () => parseRawAmount(await wallet.getAllowance({
    tokenAddress: params.inputTokenAddress,
    spenderAddress: client.spenderAddress,
  })) >= inputAmount;
  try {
    check();
    emit({});
    check();
    let wrapAmount = params.nativeInput ? inputAmount : BigInt(0);
    let readRetryBalance: (() => Promise<bigint>) | undefined;
    if (params.nativeInput && params.completedWrapTxHash) {
      const getTokenBalance = wallet.getTokenBalance;
      if (!getTokenBalance) {
        throw new SpotError("INVALID_ARGUMENT", "getTokenBalance is required to verify wrapped token funds before reusing a completed wrap");
      }
      readRetryBalance = async () => parseRawAmount(await getTokenBalance.call(wallet, { tokenAddress: params.inputTokenAddress }));
      const wrappedBalance = await readRetryBalance();
      check();
      wrapAmount = wrappedBalance < inputAmount ? inputAmount - wrappedBalance : BigInt(0);
    }
    const approvalRequired = !(await allowance());
    check();
    const wrapRequired = wrapAmount > BigInt(0);
    const steps = getExecutionSteps(wrapRequired, approvalRequired);
    emit({ steps, hasApproval: !approvalRequired });
    if (wrapRequired) {
      const wrapAmountRaw = wrapAmount.toString();
      emit({ phase: "wrapping", event: "request", wrapAmountRaw, wrapTxHash: undefined });
      check();
      observe(() => analytics.onWrapRequest(wrapAmountRaw));
      const hash = await wallet.wrapNativeToken(wrapAmountRaw);
      if (!hash) throw new SpotError("WRAP_FAILED", "failed to wrap input token");
      emit({ event: "success", wrapTxHash: hash, stepIndex: update.stepIndex + 1 });
      observe(() => analytics.onWrapSuccess(hash));
    }
    if (approvalRequired) {
      check();
      emit({ phase: "approving", event: "request" });
      check();
      const request: ApprovalRequest = {
        tokenAddress: params.inputTokenAddress,
        spenderAddress: client.spenderAddress,
        amount: params.inputAmountRaw,
      };
      observe(() => analytics.onApproveRequest(request));
      const hash = await wallet.approveToken(request);
      if (!hash) throw new SpotError("APPROVAL_FAILED", "failed to approve token");
      observe(() => analytics.onApproveConfirmed(hash));
      emit({ event: "transaction", approvalTxHash: hash });
      await verifyAllowance(allowance, check, wait);
      emit({ event: "success", hasApproval: true, stepIndex: update.stepIndex + 1 });
      observe(() => analytics.onApproveSuccess(hash));
    }
    check();
    if (readRetryBalance) {
      const wrappedBalance = await readRetryBalance();
      check();
      if (wrappedBalance < inputAmount) {
        throw new SpotError("WRAP_FAILED", "Wrapped token balance is insufficient after wallet steps; review the balance before retrying");
      }
    }
    check();
    emit({ phase: "signing", event: "request" });
    check();
    let prepared: T;
    try {
      prepared = await params.prepareOrder();
      check();
      assertReviewedOrder(prepared, params, key, client.spenderAddress);
    } catch (error) {
      observe(() => analytics.onExecutionError(error, "preparing"));
      throw error;
    }
    bindOrderAnalytics(prepared.order, analytics);
    observe(() => analytics.onOrderPrepared(prepared.order));
    emit({ event: "prepared", preparedOrder: prepared });
    check();
    observe(() => analytics.onSignOrderRequest(prepared.order));
    let signature: `0x${string}`;
    try {
      signature = await signBeforeDeadline(wallet, prepared);
      observe(() => analytics.onSignOrderSuccess(signature));
      emit({ event: "success", signature });
    } catch (error) {
      observe(() => analytics.onSignOrderError(error));
      emit({ event: "error", error });
      throw error;
    }
    check();
    emit({ phase: "submitting", event: "request" });
    check();
    const order = await client.submitOrder(prepared.order, signature, { signal: params.signal });
    bindSubmittedOrderAnalytics(order, analytics);
    return { order, preparedOrder: prepared, wrapTxHash: update.wrapTxHash, approvalTxHash: update.approvalTxHash };
  } catch (error) {
    if (update.phase === "wrapping") observe(() => analytics.onWrapError(error));
    else if (update.phase === "approving") observe(() => analytics.onApproveError(error));
    else observe(() => analytics.onExecutionError(error, update.phase));
    throw error;
  } finally {
    active.delete(key);
  }
}

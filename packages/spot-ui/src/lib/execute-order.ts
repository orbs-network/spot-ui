import type { AllowanceRequest, ApprovalRequest, OrderSigningRequest, PreparedOrder, SpotClient } from "./client";
import type { Order } from "./types";
import { SpotError } from "./errors";

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
  client: Pick<SpotClient, "spenderAddress" | "submitOrder" | "analytics">;
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
  /** Optional delay implementation for allowance retries; defaults to a timer. */
  wait?: (milliseconds: number) => Promise<void>;
}
const locks = new WeakMap<object, Set<string>>();
const waitFor = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));
const observe = (fn: () => unknown) => { try { void Promise.resolve(fn()).catch(() => undefined); } catch { /* observer */ } };
const amount = (raw: string): bigint => {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) throw new SpotError("INVALID_AMOUNT", "Token balances, allowance, and input amount must be non-negative integer base-unit amounts");
  return BigInt(raw);
};

/**
 * Runs wrapping, allowance approval, fresh order preparation, signing, and submission.
 * Only missing wallet steps are requested. Concurrent executions for the same account
 * and client are rejected. The prepared order must match the reviewed signer, input
 * token, amount, and client spender.
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
  const key = params.account.toLowerCase();
  const active = locks.get(client) ?? new Set<string>();
  if (active.has(key)) throw new SpotError("EXECUTION_IN_PROGRESS", "An order execution is already in progress for this account");
  const inputAmount = amount(params.inputAmountRaw);
  if (inputAmount <= BigInt(0)) throw new SpotError("INVALID_AMOUNT", "Input amount must be positive");
  active.add(key); locks.set(client, active);
  const check = () => { params.signal?.throwIfAborted(); params.validateContext?.(); };
  let update: OrderExecutionUpdate<T> = {
    phase: "preparing", event: "request", steps: [], stepIndex: 0,
    hasApproval: false, wrapTxHash: params.completedWrapTxHash,
  };
  const emit = (changes: Partial<OrderExecutionUpdate<T>>) => {
    update = { ...update, ...changes };
    observe(() => params.onUpdate?.({ ...update, steps: [...update.steps] }));
  };
  const allowance = async () => amount(await wallet.getAllowance({ tokenAddress: params.inputTokenAddress, spenderAddress: client.spenderAddress })) >= inputAmount;
  try {
    check(); emit({}); check();
    let wrapAmount = params.nativeInput ? inputAmount : BigInt(0);
    let readRetryBalance: (() => Promise<bigint>) | undefined;
    if (params.nativeInput && params.completedWrapTxHash) {
      const getTokenBalance = wallet.getTokenBalance;
      if (!getTokenBalance) {
        throw new SpotError("INVALID_ARGUMENT", "getTokenBalance is required to verify wrapped token funds before reusing a completed wrap");
      }
      readRetryBalance = async () => amount(await getTokenBalance.call(wallet, { tokenAddress: params.inputTokenAddress }));
      const wrappedBalance = await readRetryBalance();
      check();
      wrapAmount = wrappedBalance < inputAmount ? inputAmount - wrappedBalance : BigInt(0);
    }
    const approvalRequired = !(await allowance());
    check();
    const wrapRequired = wrapAmount > BigInt(0);
    const steps: OrderExecutionStep[] = [];
    if (wrapRequired) steps.push("wrap");
    if (approvalRequired) steps.push("approve");
    steps.push("create");
    emit({ steps, hasApproval: !approvalRequired });
    if (wrapRequired) {
      const wrapAmountRaw = wrapAmount.toString();
      emit({ phase: "wrapping", event: "request", wrapAmountRaw, wrapTxHash: undefined }); check();
      observe(() => client.analytics.onWrapRequest());
      const hash = await wallet.wrapNativeToken(wrapAmountRaw);
      if (!hash) throw new SpotError("WRAP_FAILED", "failed to wrap input token");
      emit({ event: "success", wrapTxHash: hash, stepIndex: update.stepIndex + 1 });
      observe(() => client.analytics.onWrapSuccess(hash));
    }
    if (approvalRequired) {
      check(); emit({ phase: "approving", event: "request" }); check();
      observe(() => client.analytics.onApproveRequest());
      const hash = await wallet.approveToken({ tokenAddress: params.inputTokenAddress, spenderAddress: client.spenderAddress, amount: params.inputAmountRaw });
      if (!hash) throw new SpotError("APPROVAL_FAILED", "failed to approve token");
      emit({ event: "transaction", approvalTxHash: hash });
      let approved = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        check(); approved = await allowance();
        if (approved) break;
        if (attempt < 2) await wait(3_000);
      }
      if (!approved) throw new SpotError("INSUFFICIENT_ALLOWANCE", "Insufficient allowance to submit the order. Please approve the token first.");
      emit({ event: "success", hasApproval: true, stepIndex: update.stepIndex + 1 });
      observe(() => client.analytics.onApproveSuccess(hash));
    }
    check();
    if (readRetryBalance) {
      const wrappedBalance = await readRetryBalance();
      check();
      if (wrappedBalance < inputAmount) {
        throw new SpotError("WRAP_FAILED", "Wrapped token balance is insufficient after wallet steps; review the balance before retrying");
      }
    }
    check(); emit({ phase: "signing", event: "request" }); check();
    const prepared = await params.prepareOrder();
    check();
    // A changing request must never spend more or approve a different spender than reviewed.
    if (prepared.approvalRequest.tokenAddress.toLowerCase() !== params.inputTokenAddress.toLowerCase() ||
        prepared.approvalRequest.amount !== params.inputAmountRaw ||
        prepared.approvalRequest.spenderAddress.toLowerCase() !== client.spenderAddress.toLowerCase() ||
        prepared.signingRequest.signerAddress.toLowerCase() !== key) throw new SpotError("PREPARED_ORDER_MISMATCH", "Prepared order does not match the reviewed execution");
    emit({ event: "prepared", preparedOrder: prepared }); check();
    observe(() => client.analytics.onSignOrderRequest(prepared.order));
    let signature: `0x${string}`;
    try {
      signature = await wallet.signOrder(prepared.signingRequest);
      observe(() => client.analytics.onSignOrderSuccess(signature));
      emit({ event: "success", signature });
    } catch (error) { observe(() => client.analytics.onSignOrderError(error)); emit({ event: "error", error }); throw error; }
    check(); emit({ phase: "submitting", event: "request" }); check();
    const order = await client.submitOrder(prepared.order, signature, { signal: params.signal });
    return { order, preparedOrder: prepared, wrapTxHash: update.wrapTxHash, approvalTxHash: update.approvalTxHash };
  } catch (error) {
    if (update.phase === "wrapping") observe(() => client.analytics.onWrapError(error));
    if (update.phase === "approving") observe(() => client.analytics.onApproveError(error));
    throw error;
  } finally { active.delete(key); }
}

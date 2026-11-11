import { createExecutionObserver, type OrderWalletInteractions, type OrderExecutionUpdate, type SignableOrder } from "../execute-order";
import type { ApprovalRequest, SpotClient } from "../client";
import { OrderStatus, type DeepReadonly, type Hex, type Order } from "../types";
import type { OrderExecution, ExecutionRunOptions, TransactionStepResult } from "../execution-session";
import { OrderSettlementError } from "../order-settlement-error";
import { SpotError } from "../errors";
import { MAX_UINT_256 } from "../evm-constants";
import { observe } from "../observe";
import { bindOrderAnalytics, bindSubmittedOrderAnalytics, type SpotAnalytics } from "../analytics";

export type { OrderExecutionPhase, OrderExecutionStep, OrderExecutionUpdate, SignableOrder } from "../execute-order";
const MAX_APPROVAL_TRANSACTIONS = 2;

/** Internal wallet runner inputs; public client methods own preparation. */
export interface RunOrderExecutionParams<T extends SignableOrder> {
  /** Connected account that must match the prepared order's signer. */
  account: string;
  /** ERC-20 input address; use the wrapped token address for native input. */
  inputTokenAddress: string;
  /** Reviewed positive input amount as an integer string in token base units. */
  inputAmountRaw: string;
  /** Host wallet operations with confirmed receipts for wrapping and approvals. */
  walletInteractions: OrderWalletInteractions;
  /** Called after wrapping/approval, immediately before signing, to create fresh order timestamps. */
  prepareOrder: (signal?: AbortSignal) => T | Promise<T>;
  /** Stops later steps; it cannot undo wallet transactions or an accepted submission. */
  signal?: AbortSignal;
}

/** SDK-owned services and React lifecycle wiring; never supplied by an integrator. */
export interface OrderExecutionRuntime<T extends SignableOrder> {
  client: Pick<SpotClient, "spenderAddress"> & Partial<Pick<SpotClient, "chainId" | "partner">>;
  submitOrder: (order: SignableOrder["order"], signature: `0x${string}`, options?: { signal?: AbortSignal }) => Promise<Order>;
  settleOrder?: (order: Order, onProgress: (order: Order) => void, signal?: AbortSignal) => Promise<Order>;
  /** Swap run() waits; advanced run() resolves at acceptance even when explicit tracking is available. */
  waitForCompletionOnRun?: boolean;
  onProgressSnapshot?: (original: OrderExecutionUpdate<T>, snapshot: OrderExecutionUpdate<T>) => void;
  onProgress?: (update: OrderExecutionUpdate<T>) => void;
  analytics: SpotAnalytics;
}
const parseRawAmount = (raw: string): bigint => {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new SpotError("INVALID_AMOUNT", "Input amount must be an integer base-unit amount");
  }
  return BigInt(raw);
};

const assertReviewedOrder = (
  prepared: SignableOrder,
  params: Pick<RunOrderExecutionParams<SignableOrder>, "inputTokenAddress" | "inputAmountRaw">,
  accountKey: string,
  spenderAddress: string,
): void => {
  const approval = prepared.approvalRequest;
  const matchesReview =
    approval.tokenAddress.toLowerCase() === params.inputTokenAddress.toLowerCase() &&
    approval.amount === params.inputAmountRaw &&
    approval.approvalAmount === MAX_UINT_256 &&
    approval.spenderAddress.toLowerCase() === spenderAddress.toLowerCase() &&
    prepared.signingRequest.signerAddress.toLowerCase() === accountKey;
  // Late preparation refreshes timestamps, never the reviewed spending authority.
  if (!matchesReview) {
    throw new SpotError("PREPARED_ORDER_MISMATCH", "Prepared order does not match the reviewed execution");
  }
};

const signBeforeDeadline = async (wallet: OrderWalletInteractions, prepared: SignableOrder, signal: AbortSignal): Promise<`0x${string}`> => {
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
      signal.throwIfAborted();
      if (Date.now() > deadlineMillis) throw expired();
      return wallet.signOrder(prepared.signingRequest);
    });
    const signature = await withSignal(Promise.race([signing, expiry]), signal);
    // A suspended tab can receive the wallet result before its expiry timer runs.
    if (Date.now() > deadlineMillis) throw expired();
    return signature;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

/** Frozen copies protect the signed pair and public state from mutable host objects. */
function immutableSnapshot<T>(value: T): DeepReadonly<T> {
  const copy = structuredClone(value);
  const seen = new WeakSet<object>();
  const freeze = (current: unknown): void => {
    if (!current || typeof current !== "object" || seen.has(current)) return;
    seen.add(current);
    for (const child of Object.values(current)) freeze(child);
    Object.freeze(current);
  };
  freeze(copy);
  return copy as DeepReadonly<T>;
}

async function withSignal<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([pending, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

/** An invalid transition is recoverable: the caller can complete the missing step. */
class ExecutionSequenceError extends SpotError {
  constructor(message: string) { super("INVALID_ARGUMENT", message); }
}

type ExecutionMethod = "wrap" | "approve" | "sign" | "submit" | "wait";
type StepResults = { wrap: TransactionStepResult; approve: TransactionStepResult; sign: Hex; submit: Order; wait: Order };

/** Create an independent intent without reading allowance or opening a wallet. */
export function createOrderExecutionSession<T extends SignableOrder>(
  params: RunOrderExecutionParams<T>, runtime: OrderExecutionRuntime<T>,
): OrderExecution<T> {
  return createSession({ ...params }, { ...runtime });
}

function createSession<T extends SignableOrder>(
  params: RunOrderExecutionParams<T>,
  runtime: OrderExecutionRuntime<T>,
): OrderExecution<T> {
  const sourceWallet = params.walletInteractions;
  // Bind original methods once, so replacing a host adapter later cannot change a reviewed session.
  const wallet = sourceWallet && Object.fromEntries([
    "shouldWrap", "wrapNativeToken", "shouldApprove", "approveToken", "signOrder",
  ].map(key => {
    const method = Reflect.get(sourceWallet, key);
    return [key, typeof method === "function" ? method.bind(sourceWallet) : method];
  })) as OrderWalletInteractions | undefined;
  const signal = params.signal;
  const controller = new AbortController();
  const approvalRequest: ApprovalRequest = Object.freeze({
    tokenAddress: params.inputTokenAddress, spenderAddress: runtime.client.spenderAddress,
    amount: params.inputAmountRaw, approvalAmount: MAX_UINT_256,
  });
  const analytics = runtime.analytics;
  const waitsOnRun = runtime.waitForCompletionOnRun ?? Boolean(runtime.settleOrder);
  let started = false;
  let terminalFailure: { error: unknown } | undefined;
  let activeMethod: ExecutionMethod | undefined;
  const stepPromises = new Map<ExecutionMethod, Promise<unknown>>();
  let runPromise: Promise<Order> | undefined;
  let runObserver: ((update: OrderExecutionUpdate<T>) => void) | undefined;
  let initialization: Promise<void> | undefined;
  let planRequested = false;
  let planPrepared = false;
  let planVisible = false;
  let planning: Promise<void> | undefined;
  let plannedApprovalRequired: boolean | undefined;
  let wrappingDone = false;
  let approvalDone = false;
  let prepared: T | undefined;
  let preparedSnapshot: DeepReadonly<T> | undefined;
  let signature: Hex | undefined;
  let order: Order | undefined;
  let orderSnapshot: DeepReadonly<Order> | undefined;
  let wrapTxHash: Hex | undefined;
  let approvalTxHash: Hex | undefined;
  let update: OrderExecutionUpdate<T> = {
    phase: "preparing", event: "request", steps: [],
    stepIndex: 0, hasApproval: false, wrapTxHash,
  };

  const emit = (changes: Partial<OrderExecutionUpdate<T>>): void => {
    update = { ...update, error: undefined, ...changes };
    observe(() => runtime.onProgress?.({ ...update, steps: [...update.steps] }));
    runObserver?.(planRequested && !planVisible ? {
      ...update, steps: [], stepIndex: 0,
    } : update);
  };
  const setOrder = (current: Order): void => {
    order = current;
    orderSnapshot = immutableSnapshot(current);
    const captured = orderSnapshot as Order;
    bindSubmittedOrderAnalytics(current, analytics);
    bindSubmittedOrderAnalytics(captured, analytics);
  };

  const detachSignal = (): void => signal?.removeEventListener("abort", onAbort);
  const check = (): void => {
    controller.signal.throwIfAborted();
  };
  const fail = (error: unknown): void => {
    if (terminalFailure) return;
    terminalFailure = { error };
    if (update.phase === "wrapping") observe(() => analytics.onWrapError(error));
    else if (update.phase === "approving") observe(() => analytics.onApproveError(error));
    else if (update.phase === "signing") observe(() => analytics.onSignOrderError(error));
    else if (update.phase !== "settling") observe(() => analytics.onExecutionError(error, update.phase));
    emit({ event: "error", error, ...(order ? { order } : {}) });
    detachSignal();
  };
  const cancel = (reason?: unknown): void => {
    if (controller.signal.aborted) return;
    controller.abort(reason);
    detachSignal();
    if (!activeMethod) {
      if (started && !order) fail(controller.signal.reason);
    }
  };
  function onAbort(): void { cancel(signal?.reason); }
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) cancel(signal.reason);

  const initialize = (): Promise<void> => {
    initialization ??= (async () => {
      if (!wallet) throw new SpotError("INVALID_ARGUMENT", "walletInteractions is required for execution");
      started = true;
      observe(() => analytics.onExecutionRequest({
        account: params.account, inputTokenAddress: params.inputTokenAddress, inputAmountRaw: params.inputAmountRaw,
      }));
      emit({ phase: "preparing", event: "request" });
      check();
      if (parseRawAmount(params.inputAmountRaw) <= BigInt(0)) {
        throw new SpotError("INVALID_AMOUNT", "Input amount must be positive");
      }
      for (const method of ["shouldWrap", "wrapNativeToken", "shouldApprove", "approveToken", "signOrder"] as const) {
        if (typeof wallet[method] !== "function") {
          throw new SpotError("INVALID_ARGUMENT", `walletInteractions.${method} is required`);
        }
      }
    })();
    return planRequested ? initialization.then(planPrerequisites) : initialization;
  };

  const perform = <K extends ExecutionMethod>(method: K, body: () => Promise<StepResults[K]>): Promise<StepResults[K]> => {
    const previous = stepPromises.get(method);
    if (previous) return previous as Promise<StepResults[K]>;
    if (activeMethod) return Promise.reject(new ExecutionSequenceError(`Cannot ${method} while ${activeMethod} is in progress`));
    if (terminalFailure) return Promise.reject(terminalFailure.error);
    activeMethod = method;
    const pending = Promise.resolve().then(() => {
      check();
      return body();
    }).catch(error => {
      if (error instanceof ExecutionSequenceError) {
        // Missing steps do not destroy a valid session.
        emit({ event: "error", error });
        stepPromises.delete(method);
      } else fail(error);
      throw error;
    }).finally(() => {
      if (activeMethod === method) activeMethod = undefined;
    });
    stepPromises.set(method, pending);
    // Promise identity is intentionally stable, including mutation failures and uncertain POSTs.
    return pending;
  };

  // Preview reads are intentionally fresh and do not enter the execution state machine.
  const shouldWrap = async (): Promise<boolean> => {
    check();
    if (wrappingDone || signature || order) return false;
    if (typeof wallet?.shouldWrap !== "function") {
      throw new SpotError("INVALID_ARGUMENT", "walletInteractions.shouldWrap is required");
    }
    const required = await withSignal(Promise.resolve(wallet.shouldWrap()), controller.signal);
    check();
    if (typeof required !== "boolean") {
      throw new SpotError("INVALID_ARGUMENT", "walletInteractions.shouldWrap must return a boolean");
    }
    return !wrappingDone && !signature && !order && required;
  };

  const shouldApprove = async (): Promise<boolean> => {
    check();
    if (approvalDone || signature || order) return false;
    if (typeof wallet?.shouldApprove !== "function") {
      throw new SpotError("INVALID_ARGUMENT", "walletInteractions.shouldApprove is required");
    }
    const required = await withSignal(Promise.resolve(wallet.shouldApprove(approvalRequest)), controller.signal);
    check();
    if (typeof required !== "boolean") {
      throw new SpotError("INVALID_ARGUMENT", "walletInteractions.shouldApprove must return a boolean");
    }
    return !approvalDone && !signature && !order && required;
  };

  const preparePlan = (wrapRequired: boolean, approvalRequired: boolean): void => {
    const steps: OrderExecutionUpdate<T>["steps"] = [
      ...(wrapRequired || wrapTxHash ? ["wrap" as const] : []),
      ...(approvalRequired || approvalTxHash ? ["approve" as const] : []),
      "create",
    ];
    planPrepared = true;
    emit({
      steps,
      stepIndex: order && (!waitsOnRun || order.status === OrderStatus.Completed)
        ? steps.length
        : Number(Boolean(wrapTxHash)) + Number(Boolean(approvalTxHash)),
      hasApproval: approvalDone || !approvalRequired,
    });
  };
  const planPrerequisites = (): Promise<void> => {
    planning ??= (async () => {
      emit({ phase: "preparing", event: "request", steps: [], stepIndex: 0 });
      check();
      const [wrapRequired, approvalRequired] = await Promise.all([shouldWrap(), shouldApprove()]);
      check();
      plannedApprovalRequired = approvalRequired;
      preparePlan(wrapRequired, approvalRequired);
    })();
    return planning;
  };
  const withPrerequisite = (step: "wrap" | "approve", required: boolean): OrderExecutionUpdate<T>["steps"] =>
    (["wrap", "approve", "create"] as const).filter(current =>
      current === step ? required : current === "create" || update.steps.includes(current),
    );

  const skipWrap = (): void => {
    wrappingDone = true;
    emit({ phase: "preparing", event: "skipped", steps: withPrerequisite("wrap", false) });
  };
  const skipApproval = (): void => {
    approvalDone = true;
    emit({ phase: "preparing", event: "skipped", hasApproval: true, steps: withPrerequisite("approve", false) });
  };

  const ensureWrapped = async (): Promise<void> => {
    if (wrappingDone) return;
    emit({ phase: "preparing", event: "request" });
    if (await shouldWrap()) {
      emit({ steps: withPrerequisite("wrap", true) });
      throw new ExecutionSequenceError("Call wrap() before continuing; native wrapping is required");
    }
    skipWrap();
    check();
  };
  const ensureApproved = async (): Promise<void> => {
    if (approvalDone) return;
    emit({ phase: "preparing", event: "request" });
    if (await shouldApprove()) {
      emit({ steps: withPrerequisite("approve", true), hasApproval: false });
      throw new ExecutionSequenceError("Call approve() before sign(); approval is required");
    }
    skipApproval();
    check();
  };

  const wrap = (): Promise<TransactionStepResult> => perform("wrap", async () => {
    await initialize();
    check();
    const raw = params.inputAmountRaw;
    emit({ phase: "preparing", event: "request" });
    check();
    const required = await shouldWrap();
    check();
    if (!required) {
      skipWrap();
      check();
      return Object.freeze({ status: "skipped" });
    }
    if (planRequested && planPrepared) planVisible = true;
    emit({ phase: "wrapping", event: "request", wrapAmountRaw: raw, steps: withPrerequisite("wrap", true) });
    check();
    observe(() => analytics.onWrapRequest(raw));
    const hash = await wallet!.wrapNativeToken(raw);
    if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length <= 2) {
      throw new SpotError("WRAP_FAILED", "wrapNativeToken must return a confirmed transaction hash");
    }
    wrapTxHash = hash;
    wrappingDone = true;
    emit({ event: "success", wrapTxHash: hash, stepIndex: update.stepIndex + 1 });
    observe(() => analytics.onWrapSuccess(hash));
    check();
    return Object.freeze({ status: "success", txHash: hash });
  });

  const approve = (): Promise<TransactionStepResult> => perform("approve", async () => {
    await initialize();
    check();
    await ensureWrapped();
    emit({ phase: "preparing", event: "request" });
    check();
    // A native deposit preserves token allowance, so run() can use its pre-wrap
    // decision here. Approval receipts still require a fresh allowance check below.
    const required = planRequested && wrapTxHash && plannedApprovalRequired !== undefined
      ? plannedApprovalRequired
      : await shouldApprove();
    plannedApprovalRequired = undefined;
    check();
    if (!required) {
      skipApproval();
      check();
      return Object.freeze({ status: "skipped" });
    }
    for (let attempt = 0; attempt < MAX_APPROVAL_TRANSACTIONS; attempt += 1) {
      check();
      if (planRequested && planPrepared) planVisible = true;
      emit({ phase: "approving", event: "request", steps: withPrerequisite("approve", true), hasApproval: false });
      check();
      observe(() => analytics.onApproveRequest(approvalRequest));
      check();
      const hash = await wallet!.approveToken(approvalRequest);
      if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length <= 2) {
        throw new SpotError("APPROVAL_FAILED", "approveToken must return a confirmed transaction hash");
      }
      approvalTxHash = hash;
      emit({ event: "transaction", approvalTxHash: hash });
      observe(() => analytics.onApproveConfirmed(hash));
      check();
      // A confirmed transaction does not guarantee that enough allowance was granted.
      const approvalStillRequired = await shouldApprove();
      check();
      if (!approvalStillRequired) {
        approvalDone = true;
        emit({ event: "success", hasApproval: true, stepIndex: update.stepIndex + 1 });
        observe(() => analytics.onApproveSuccess(hash));
        return Object.freeze({ status: "success", txHash: hash });
      }
    }
    throw new SpotError("INSUFFICIENT_ALLOWANCE", "Token allowance is still insufficient after retrying approval. Review the allowance before trying again.");
  });

  const sign = (): Promise<Hex> => perform("sign", async () => {
    await initialize();
    check();
    await ensureWrapped();
    await ensureApproved();
    check();
    if (planRequested && !planVisible) {
      preparePlan(false, false);
      planVisible = true;
    }
    emit({ phase: "signing", event: "request" });
    check();
    const original = await params.prepareOrder(controller.signal);
    check();
    prepared = immutableSnapshot(original) as T;
    preparedSnapshot = prepared as DeepReadonly<T>;
    assertReviewedOrder(prepared, params, params.account.toLowerCase(), runtime.client.spenderAddress);
    bindOrderAnalytics(prepared.order, analytics);
    observe(() => analytics.onOrderPrepared(prepared!.order));
    emit({ event: "prepared", preparedOrder: prepared });
    check();
    observe(() => analytics.onSignOrderRequest(prepared!.order));
    signature = await signBeforeDeadline(wallet!, prepared, controller.signal);
    check();
    observe(() => analytics.onSignOrderSuccess(signature!));
    emit({ event: "success", signature });
    return signature;
  });

  const submit = (): Promise<Order> => perform("submit", async () => {
    if (!prepared || !signature) throw new ExecutionSequenceError("Call sign() before submit()");
    check();
    const deadlineMillis = Number(prepared.order.deadline) * 1000;
    const checkDeadline = (): void => {
      if (Date.now() > deadlineMillis) {
        throw new SpotError("ORDER_EXPIRED", "Order expired before submission; review a new order before signing again");
      }
    };
    checkDeadline();
    emit({ phase: "submitting", event: "request" });
    check();
    checkDeadline();
    // Once sent, the bounded submission request must retain a late acceptance.
    // Execution cancellation only stops subsequent steps and settlement tracking.
    const current = await runtime.submitOrder(prepared.order, signature);
    // A late acceptance is still valuable when tracking was cancelled during POST.
    setOrder(current);
    emit({ phase: waitsOnRun ? "settling" : "submitting", event: "accepted", order: current });
    if (!waitsOnRun) {
      emit({ event: "success", order: current, stepIndex: update.steps.length });
    }
    return orderSnapshot as Order;
  });

  const waitForCompletion = (): Promise<Order> => perform("wait", async () => {
    if (!order) throw new ExecutionSequenceError("Call submit() before waitForCompletion()");
    check();
    started = true;
    emit({ phase: "settling", event: "request", order });
    let current = order;
    if (current.status !== OrderStatus.Completed) {
      if (!runtime.settleOrder) throw new ExecutionSequenceError("Order tracking is unavailable for this execution");
      try {
        current = await runtime.settleOrder(current, value => {
          setOrder(value);
          emit({ phase: "settling", event: "updated", order: value });
        }, controller.signal);
      } catch (error) {
        if (error instanceof OrderSettlementError && error.order) setOrder(error.order);
        throw error;
      }
    }
    check();
    setOrder(current);
    emit({ phase: "settling", event: "success", order: current, stepIndex: update.steps.length });
    detachSignal();
    return orderSnapshot as Order;
  });

  const run = (options?: ExecutionRunOptions<T>): Promise<Order> => {
    if (runPromise) return runPromise;
    planRequested = true;
    const observer = createExecutionObserver(options?.onProgress, runtime.onProgressSnapshot);
    runObserver = observer;
    const pending = Promise.resolve().then(async () => {
      if (!signature) {
        // A manual later step may still be checking skipped prerequisites.
        // Join it before deciding which earlier steps remain necessary.
        const walletStep = stepPromises.get("sign") ?? stepPromises.get("approve") ?? stepPromises.get("wrap");
        if (walletStep) await walletStep;
        if (!signature && !wrappingDone) await wrap();
        if (!signature && !approvalDone) await approve();
        if (!signature) await sign();
      }
      if (!planVisible) {
        planVisible = true;
        preparePlan(false, false);
      }
      if (!order) await submit();
      if (waitsOnRun) return waitForCompletion();
      return orderSnapshot as Order;
    });
    runPromise = pending;
    const clearObserver = (): void => {
      if (runObserver === observer) {
        runObserver = undefined;
        planRequested = false;
      }
    };
    void pending.then(clearObserver, error => {
      if (error instanceof ExecutionSequenceError) {
        if (runPromise === pending) runPromise = undefined;
      } else fail(error);
      clearObserver();
    });
    return pending;
  };

  return Object.freeze({
    get order() { return orderSnapshot; },
    get preparedOrder() { return preparedSnapshot; },
    get signature() { return signature; },
    get wrapTxHash() { return wrapTxHash; },
    get approvalTxHash() { return approvalTxHash; },
    shouldWrap, shouldApprove, wrap, approve, sign, submit, waitForCompletion, run, cancel,
  });
}

import { Module, OrderStatus, OrderType, type Address, type Hex, type Order, type Partners, type RePermitData, type RePermitOrder, type Token } from "./types";
import pkg from "../../package.json";
import { observe } from "./observe";
import { getOrderEpochSeconds } from "./order-timing";
import type { ApprovalRequest } from "./client";

const BI_VERSION = 0.8;
const BI_ENDPOINT = `https://bi.orbs.network/putes/twap-ui-${BI_VERSION}`;
const BI_TIMEOUT_MILLIS = 5_000;
const browserSessions = new WeakMap<Window, string>();

let UI_VERSION = "unknown";
export function setUIVersion(version: string): void { UI_VERSION = version; }

/** Safe context only: signatures, typed-data messages, and complete orders are never payload fields. */
export interface AnalyticsContext {
  account?: string;
  chainId?: number;
  partner?: Partners;
  inputTokenAddress?: string;
  inputTokenSymbol?: string;
  outputTokenAddress?: string;
  outputTokenSymbol?: string;
  inputAmountRaw?: string;
  minimumOutputAmountRaw?: string;
  inputAmountPerTradeRaw?: string;
  triggerOutputAmountPerTradeRaw?: string;
  totalTrades?: number;
  deadlineMillis?: number;
  fillDelayMillis?: number;
  slippagePercent?: number;
  isMarketOrder?: boolean;
  module?: Module;
  orderId?: string;
  quoteUser?: string;
}

type Action = "cancel order" | "wrap" | "approve" | "sign order" | "create order" |
  "module-import" | "reset" | "crash" | "execution" | "configuration" | "quote" | "settlement" | "recovery";

interface Data {
  _id: string;
  operationId?: string;
  sessionId?: string;
  eventName?: string;
  eventSequence?: number;
  eventTimestampMillis?: number;
  sdkVersion?: string;
  uiVersion?: string;
  origin?: string;
  action?: Action;
  actionError?: string;
  errorCode?: string | number;
  errorStatus?: number;
  errorServiceCode?: string | number;
  errorPhase?: string;
  /** Internal context for generic failures; eventName describes progress in emitted logs. */
  executionPhase?: string;
  quoteUser?: string;
  quoteSuccess?: boolean;
  quoteReused?: boolean;
  reviewedMinimumOutputAmountRaw?: string;
  freshMinimumOutputAmountRaw?: string;
  cancelOrderSuccess?: boolean;
  orderSubmitted?: boolean;
  orderHash?: string;
  /** Legacy field: acceptance succeeded, not necessarily settlement. */
  orderSuccess?: boolean;
  orderFilled?: boolean;
  orderProgress?: number;
  filledInputAmountRaw?: string;
  filledOutputAmountRaw?: string;
  wrapTxHash?: string;
  wrapAmountRaw?: string;
  cancelOrderTxHash?: string;
  cancelOrderId?: string;
  cancelOrderVersion?: 1 | 2;
  /** @deprecated Legacy input only; outbound cancellation events use one scalar target. */
  cancelOrderIdsV1?: string[];
  /** @deprecated Legacy input only; outbound cancellation events use one scalar target. */
  cancelOrderIdsV2?: string[];
  approvalTxHash?: string;
  approvalTokenAddress?: string;
  approvalSpenderAddress?: string;
  approvalAmountRaw?: string;
  walletAddress?: string;
  fromTokenAddress?: string;
  fromTokenSymbol?: string;
  toTokenAddress?: string;
  toTokenSymbol?: string;
  fromTokenAmount?: string;
  chunksAmount?: number;
  minDstAmountOutPerTrade?: string;
  triggerPricePerTrade?: string;
  deadline?: number;
  fillDelay?: number;
  srcChunkAmount?: string;
  module?: Module;
  slippage?: number;
  orderType?: "market" | "limit";
  partner?: Partners;
  adapter?: Address;
  executor?: Address;
  reactor?: Address;
  repermit?: Address;
  chainId?: number;
  name?: string;
  domainName?: string;
  domainVersion?: string;
  primaryType?: string;
  spender?: Address;
  exchangeRef?: Address;
  exchangeShare?: number;
  exchangeData?: Hex;
  configFreshness?: number;
  configExclusivity?: number;
  configEpoch?: number;
  configSlippage?: number;
}

interface SuppressionPolicy {
  disabled: boolean;
  generation: number;
  requests: Set<AbortController>;
}
type LogValue = string | number | boolean;
type LogPayload = Record<string, LogValue>;
interface CancellationTarget {
  cancelOrderId: string;
  cancelOrderVersion: 1 | 2;
}
const CLEAR_ERROR_FIELDS: Partial<Data> = {
  actionError: undefined, errorCode: undefined, errorStatus: undefined,
  errorServiceCode: undefined, errorPhase: undefined,
};
const policies = new WeakMap<Analytics, SuppressionPolicy>();
// A provider policy may span several clients; trade attribution belongs to one client only.
const attributionScopes = new WeakMap<Analytics, object>();
const orderAnalytics = new WeakMap<RePermitOrder, Analytics>();
const submittedAnalytics = new WeakMap<Order, Analytics>();

function generateId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 16)}${Math.random().toString(36).substring(2, 16)}${Date.now().toString(36)}`;
}
/** One in-memory ID per page load, shared by its clients and operations. */
function getBrowserSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const cached = browserSessions.get(window);
  if (cached) return cached;

  const sessionId = generateId("session");
  browserSessions.set(window, sessionId);
  return sessionId;
}
function getOrigin(): string | undefined {
  try { return typeof window === "undefined" ? undefined : window.location.origin; }
  catch { return undefined; }
}
function baseData(): Data {
  const operationId = generateId("operation");
  return { _id: operationId, operationId, sdkVersion: pkg.version, uiVersion: UI_VERSION, origin: getOrigin() };
}
const TRADE_FIELDS = [
  "fromTokenAddress", "fromTokenSymbol", "toTokenAddress", "toTokenSymbol", "fromTokenAmount",
  "chunksAmount", "minDstAmountOutPerTrade", "triggerPricePerTrade", "deadline", "fillDelay",
  "srcChunkAmount", "slippage", "orderType",
] as const satisfies readonly (keyof Data)[];
const COMMON_FIELDS = ["sdkVersion", "uiVersion", "origin", "partner", "chainId", "walletAddress", "module"] as const;
const ERROR_FIELDS = ["actionError", "errorCode", "errorStatus", "errorServiceCode"] as const;
const QUOTE_FIELDS = ["quoteUser", "fromTokenAddress", "toTokenAddress", "fromTokenAmount", "slippage"] as const;
const SETTLEMENT_FIELDS = ["orderHash", "filledInputAmountRaw", "filledOutputAmountRaw"] as const;
const CANCELLATION_FIELDS = ["orderHash", "cancelOrderId", "cancelOrderVersion"] as const;
const EVENT_FIELDS: Readonly<Record<string, readonly (keyof Data)[]>> = {
  "configuration.loaded": [
    "adapter", "executor", "reactor", "repermit", "spender", "exchangeRef", "exchangeShare",
    "domainName", "domainVersion", "primaryType", "configExclusivity",
  ],
  "execution.requested": TRADE_FIELDS,
  "order.requested": TRADE_FIELDS,
  "order.prepared": TRADE_FIELDS,
  "quote.requested": QUOTE_FIELDS,
  "quote.reused": QUOTE_FIELDS,
  "quote.rejected": ["reviewedMinimumOutputAmountRaw", "freshMinimumOutputAmountRaw"],
  "wrap.requested": ["wrapAmountRaw"],
  "wrap.succeeded": ["wrapTxHash"],
  "wrap.failed": ["wrapTxHash"],
  "approval.requested": ["approvalTokenAddress", "approvalSpenderAddress", "approvalAmountRaw"],
  "approval.confirmed": ["approvalTxHash"],
  "approval.succeeded": ["approvalTxHash"],
  "approval.failed": ["approvalTxHash"],
  "submission.succeeded": ["orderHash"],
  "submission.failed": ["orderHash"],
  "cancellation.requested": CANCELLATION_FIELDS,
  "cancellation.succeeded": [...CANCELLATION_FIELDS, "cancelOrderTxHash"],
  "cancellation.failed": [...CANCELLATION_FIELDS, "cancelOrderTxHash"],
  "settlement.updated": [...SETTLEMENT_FIELDS, "orderProgress"],
  "settlement.filled": SETTLEMENT_FIELDS,
  "settlement.cancelled": SETTLEMENT_FIELDS,
  "settlement.expired": SETTLEMENT_FIELDS,
  "settlement.unconfirmed": ["orderHash"],
  "settlement.aborted": ["orderHash"],
  "settlement.failed": ["orderHash"],
  "recovery.requested": ["orderHash"],
  "recovery.failed": ["orderHash"],
};
const TRADE_EVENTS = new Set(["execution.requested", "order.requested", "order.prepared"]);
const ERROR_EVENTS = new Set([
  "quote.rejected", "settlement.unconfirmed", "settlement.aborted", "crash",
]);
function isPositiveAmount(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > BigInt(0);
}
/** Remove unused single-trade defaults while retaining an actual interval when the count is unknown. */
function trimTradeFields(values: Partial<Data>, context: Partial<Data>): void {
  const count = context.chunksAmount;
  const knownSingleTrade = context.module !== undefined && context.module !== Module.TWAP || count !== undefined && count <= 1;
  const multipleTrades = !knownSingleTrade && (count !== undefined && count > 1 || count === undefined &&
    isPositiveAmount(values.srcChunkAmount) && isPositiveAmount(values.fromTokenAmount) &&
    BigInt(values.srcChunkAmount) < BigInt(values.fromTokenAmount));
  if (!multipleTrades) {
    delete values.chunksAmount;
    delete values.srcChunkAmount;
  }
  if (knownSingleTrade || typeof values.fillDelay !== "number" || values.fillDelay <= 0) delete values.fillDelay;
  if (context.module !== Module.STOP_LOSS && context.module !== Module.TAKE_PROFIT || !isPositiveAmount(values.triggerPricePerTrade)) {
    delete values.triggerPricePerTrade;
  }
  if (!isPositiveAmount(values.minDstAmountOutPerTrade)) delete values.minDstAmountOutPerTrade;
  if (!isPositiveAmount(values.srcChunkAmount)) delete values.srcChunkAmount;
  if (!isPositiveAmount(values.fromTokenAmount)) delete values.fromTokenAmount;
  if (typeof values.deadline !== "number" || values.deadline <= 0) delete values.deadline;
  if (context.module === Module.SWAP || context.module === Module.LIMIT) delete values.orderType;
}
/** Event names define their payload; old/custom callers cannot attach unrelated history. */
function selectEventData(eventName: string, values: Partial<Data>, context: Partial<Data>): Partial<Data> {
  const fields = Object.prototype.hasOwnProperty.call(EVENT_FIELDS, eventName) ? EVENT_FIELDS[eventName] : [];
  const selected = selectData(values, fields ?? []);
  if (TRADE_EVENTS.has(eventName)) trimTradeFields(selected, context);
  if (eventName.endsWith(".failed") || ERROR_EVENTS.has(eventName)) {
    Object.assign(selected, selectData(values, ERROR_FIELDS));
    if (typeof selected.actionError === "string") selected.actionError = getAnalyticsErrorMessage(selected.actionError);
  }
  if (eventName === "execution.failed") Object.assign(selected, selectData(values, ["errorPhase"]));
  if (eventName.startsWith("cancellation.") && typeof selected.cancelOrderId === "string") delete selected.orderHash;
  return selected;
}
function isLogValue(value: unknown): value is LogValue {
  return typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
}
/** Apply after the envelope too, since JavaScript callers can bypass public TypeScript types. */
function primitiveLogPayload(values: Record<string, unknown>): LogPayload {
  const payload: LogPayload = {};
  for (const [key, value] of Object.entries(values)) {
    if (isLogValue(value)) payload[key] = value;
  }
  return payload;
}
/** Whitelist scalar fields so even legacy updateAndSend callers cannot add signed payloads. */
function selectData(data: Partial<Data>, fields: readonly (keyof Data)[]): Partial<Data> {
  const selected: Record<string, unknown> = {};
  for (const field of fields) {
    const value = data[field];
    if (isLogValue(value) && (typeof value !== "string" || value.trim())) {
      selected[field] = value;
    }
  }
  return selected as Partial<Data>;
}
function contextData(context: AnalyticsContext): Partial<Data> {
  const totalTrades = context.totalTrades ?? (
    context.module !== undefined && context.module !== Module.TWAP ? 1 : undefined
  );
  // Log the effective signed interval, rather than an unused single-trade form default.
  const effectiveFillDelayMillis = typeof context.fillDelayMillis === "number" &&
    Number.isFinite(context.fillDelayMillis) && totalTrades !== undefined && Number.isFinite(totalTrades)
    ? getOrderEpochSeconds(context.fillDelayMillis, totalTrades) * 1000
    : context.fillDelayMillis;
  const fields = {
    account: "walletAddress", chainId: "chainId", partner: "partner",
    inputTokenAddress: "fromTokenAddress", inputTokenSymbol: "fromTokenSymbol",
    outputTokenAddress: "toTokenAddress", outputTokenSymbol: "toTokenSymbol",
    inputAmountRaw: "fromTokenAmount", minimumOutputAmountRaw: "minDstAmountOutPerTrade",
    inputAmountPerTradeRaw: "srcChunkAmount", triggerOutputAmountPerTradeRaw: "triggerPricePerTrade",
    totalTrades: "chunksAmount", deadlineMillis: "deadline", fillDelayMillis: "fillDelay",
    slippagePercent: "slippage", module: "module", orderId: "orderHash", quoteUser: "quoteUser",
  } as const;
  const numericFields = new Set<keyof typeof fields>([
    "chainId", "totalTrades", "deadlineMillis", "fillDelayMillis", "slippagePercent",
  ]);
  const result: Record<string, unknown> = {};
  for (const [source, target] of Object.entries(fields)) {
    const value = source === "fillDelayMillis"
      ? effectiveFillDelayMillis
      : context[source as keyof typeof fields];
    const numeric = numericFields.has(source as keyof typeof fields);
    if (numeric ? typeof value === "number" && Number.isFinite(value) : typeof value === "string") result[target] = value;
  }
  if (typeof context.isMarketOrder === "boolean") result.orderType = context.isMarketOrder ? "market" : "limit";
  return result as Partial<Data>;
}
function getFetchedConfigDetails(permitData: RePermitData, partner: Partners): Partial<Data> {
  const { witness } = permitData.order;
  return {
    partner, adapter: witness.exchange.adapter, executor: witness.executor, reactor: witness.reactor,
    repermit: permitData.domain.verifyingContract, chainId: permitData.domain.chainId, name: permitData.partner,
    domainName: permitData.domain.name, domainVersion: permitData.domain.version, primaryType: permitData.primaryType,
    spender: permitData.order.spender, exchangeRef: witness.exchange.ref, exchangeShare: witness.exchange.share,
    exchangeData: witness.exchange.data, configFreshness: witness.freshness, configExclusivity: witness.exclusivity,
    configEpoch: witness.epoch, configSlippage: witness.slippage,
  };
}
function errorField(error: unknown, field: string): unknown {
  try { return typeof error === "object" && error !== null ? Reflect.get(error, field) : undefined; }
  catch { return undefined; }
}
function scalarErrorField(error: unknown, field: string): string | number | undefined {
  const value = errorField(error, field);
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) ? value : undefined;
}
function getAnalyticsErrorMessage(error: unknown): string {
  const value = typeof error === "string" ? error : errorField(error, "message");
  const message = typeof value === "string" && value.trim() ? value : String(scalarErrorField(error, "code") ?? "unknown error");
  // Wallet/RPC messages can append request data. Retain the summary, not signatures or payload dumps.
  return message.split(/[\r\n{\[]/, 1)[0]!.replace(/0x[0-9a-f]{128,}/gi, "[redacted hex]").slice(0, 500).toLowerCase() || "unknown error";
}
function getErrorDetails(error: unknown, phase?: string): Partial<Data> {
  const status = scalarErrorField(error, "status");
  return {
    actionError: getAnalyticsErrorMessage(error), errorPhase: phase,
    errorCode: scalarErrorField(error, "code"), errorStatus: typeof status === "number" ? status : undefined,
    errorServiceCode: scalarErrorField(error, "serviceCode"),
  };
}
function logDeliveryError(error: unknown): void {
  try { console.error("Failed to send BI", error); } catch { /* Diagnostics cannot affect the caller. */ }
}

/** Bounded best-effort delivery. A disabled generation can never be replayed after re-enabling. */
async function sendBI(data: LogPayload, policy: SuppressionPolicy, generation: number): Promise<void> {
  if (policy.disabled || policy.generation !== generation) return;
  const controller = new AbortController();
  policy.requests.add(controller);
  let rejectAborted!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAborted = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectAborted, { once: true });
  });
  const timeout = setTimeout(() => controller.abort(new Error("BI request timed out")), BI_TIMEOUT_MILLIS);
  try {
    const response = await Promise.race([fetch(BI_ENDPOINT, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(data), signal: controller.signal, keepalive: true,
    }), aborted]);
    if (!response.ok) throw new Error(`BI request failed: ${response.status}`);
  } catch (error) {
    if (!policy.disabled && policy.generation === generation) logDeliveryError(error);
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", rejectAborted);
    policy.requests.delete(controller);
  }
}

export class Analytics {
  private readonly policy: SuppressionPolicy;
  private delivery: Promise<void> = Promise.resolve();
  private reportedErrors = new WeakSet<object>();
  private preparedOrders = new WeakSet<RePermitOrder>();
  private readonly reportedPrimitiveErrors = new Set<unknown>();
  private settlementKey = "";
  private terminalSettlement?: Pick<Order, "id" | "status">;
  private executionStarted = false;
  private eventSequence = 0;
  private cancellationTargets: CancellationTarget[] = [];
  /** @deprecated Events are sent immediately; retained for source compatibility. */
  timeout: ReturnType<typeof setTimeout> | undefined;
  configDetails: Partial<Data> = {};
  moduleImportKey = "";
  data: Data = baseData();

  constructor(disabled = false, private readonly operationScoped = false, policy?: SuppressionPolicy) {
    this.policy = policy ?? { disabled, generation: 0, requests: new Set() };
    policies.set(this, this.policy);
    attributionScopes.set(this, {});
  }
  get isDisabled(): boolean { return this.policy.disabled; }

  setDisabled(disabled: boolean): void {
    if (this.policy.disabled === disabled) return;
    this.policy.disabled = disabled;
    this.policy.generation++;
    if (disabled) {
      for (const controller of this.policy.requests) controller.abort(new Error("Analytics disabled"));
    }
  }

  createOperation(context: AnalyticsContext = {}): SpotAnalytics {
    const operation = new Analytics(false, true, this.policy);
    attributionScopes.set(operation, attributionScopes.get(this)!);
    operation.configDetails = { ...this.configDetails };
    operation.moduleImportKey = this.moduleImportKey;
    operation.data = {
      ...operation.data, ...operation.configDetails, ...contextData(context),
      uiVersion: this.data.uiVersion && this.data.uiVersion !== "unknown" ? this.data.uiVersion : UI_VERSION,
      origin: this.data.origin ?? getOrigin(), sdkVersion: pkg.version, _id: operation.data._id,
    };
    return operation;
  }

  private captureEvent(eventName: string, values: Partial<Data>): LogPayload {
    return primitiveLogPayload({
      ...selectData(this.data, COMMON_FIELDS),
      ...selectEventData(eventName, values, this.data),
      // Inferred swap context belongs to this event, not to a reusable reporter.
      ...(this.data.module === undefined && eventName.startsWith("settlement.") ? { module: Module.SWAP } : {}),
      _id: generateId(),
      operationId: this.data.operationId ?? this.data._id,
      sessionId: getBrowserSessionId(),
      eventName,
      eventSequence: ++this.eventSequence,
      eventTimestampMillis: Date.now(),
    });
  }
  private enqueue(payload: LogPayload): Promise<void> {
    const generation = this.policy.generation;
    // Preserve event order without making BI delivery part of the trading flow.
    this.delivery = this.delivery.then(() => sendBI(payload, this.policy, generation)).catch(logDeliveryError);
    return this.delivery;
  }
  private resetErrors(): void {
    this.reportedErrors = new WeakSet();
    this.reportedPrimitiveErrors.clear();
  }
  private resetSettlement(): void {
    this.settlementKey = "";
    this.terminalSettlement = undefined;
  }
  private isSwapSettlement(order?: Pick<Order, "type">): boolean {
    // The captured module is authoritative; restored orders fall back to their normalized type.
    return this.data.module !== undefined
      ? this.data.module === Module.SWAP
      : order?.type === OrderType.SWAP;
  }
  private claimError(error: unknown): boolean {
    const object = (typeof error === "object" && error !== null) || typeof error === "function";
    if (object) {
      if (this.reportedErrors.has(error as object)) return false;
      this.reportedErrors.add(error as object);
    } else {
      if (this.reportedPrimitiveErrors.has(error)) return false;
      this.reportedPrimitiveErrors.add(error);
    }
    return true;
  }
  private reportFailure(eventName: string, error: unknown, phase: string | undefined, values: Partial<Data>): void {
    if (this.isDisabled || !this.claimError(error)) return;
    void this.emitEvent(eventName, { ...values, ...getErrorDetails(error, phase) });
  }
  private emitCancellation(eventName: string, values: Partial<Data>): void {
    if (!this.cancellationTargets.length) {
      void this.emitEvent(eventName, { ...values, orderHash: this.data.orderHash });
      return;
    }
    for (const target of this.cancellationTargets) {
      void this.emitEvent(eventName, { ...values, ...target });
    }
  }

  private async emitEvent(eventName: string, values: Partial<Data>, callback?: () => void): Promise<void> {
    if (this.isDisabled) return;
    try {
      // Only attempt creation may change correlation, including through the legacy entry point.
      this.data = { ...this.data, ...values, _id: this.data._id, operationId: this.data.operationId };
      // Only this event's values are emitted. Cumulative state is for correlation and deduplication.
      const payload = this.captureEvent(eventName, values);
      await this.enqueue(payload);
      if (callback) observe(callback);
    } catch (error) { logDeliveryError(error); }
  }

  /** Legacy entry point: every call now creates a separate event, with no debounce. */
  async updateAndSend(values: Partial<Data> = {}, _noTimeout = false, callback?: () => void): Promise<void> {
    await this.emitEvent(values.eventName ?? "analytics.updated", values, callback);
  }

  onExecutionRequest(context: AnalyticsContext = {}): void {
    if (this.isDisabled) return;
    this.resetErrors();
    this.resetSettlement();
    this.cancellationTargets = [];
    if (this.executionStarted) {
      this.preparedOrders = new WeakSet();
      this.data = { ...baseData(), ...this.configDetails, ...contextData(context) };
      this.eventSequence = 0;
    }
    this.executionStarted = true;
    this.data = { ...this.data, ...contextData(context) };
    void this.emitEvent("execution.requested", {
      ...CLEAR_ERROR_FIELDS, ...selectData(this.data, TRADE_FIELDS), action: "execution", executionPhase: "preparing",
    });
  }
  onExecutionError(error: unknown, phase?: string): void {
    this.reportFailure("execution.failed", error, phase ?? this.data.executionPhase, { action: "execution", executionPhase: phase ?? this.data.executionPhase });
  }
  onConfigurationError(error: unknown): void { this.reportFailure("configuration.failed", error, "configuration", { action: "configuration" }); }
  onQuoteRequest(context: AnalyticsContext = {}): void {
    void this.emitEvent("quote.requested", {
      ...CLEAR_ERROR_FIELDS, ...selectData(contextData(context), [...COMMON_FIELDS, ...QUOTE_FIELDS]), action: "quote",
    });
  }
  onQuoteSuccess({ reused = false, context }: { reused?: boolean; context?: AnalyticsContext } = {}): void {
    const quote = reused ? selectData(context ? contextData(context) : this.data, [
      "quoteUser", "fromTokenAddress", "toTokenAddress", "fromTokenAmount", "slippage",
    ]) : {};
    void this.emitEvent(reused ? "quote.reused" : "quote.succeeded", {
      ...CLEAR_ERROR_FIELDS, ...quote, action: "quote", quoteSuccess: true, quoteReused: reused,
    });
  }
  onQuoteError(error: unknown): void { this.reportFailure("quote.failed", error, "quote", { action: "quote", quoteSuccess: false }); }
  onQuoteValidationError(error: unknown, comparison?: {
    reviewedMinimumOutputAmountRaw: string;
    freshMinimumOutputAmountRaw: string;
  }): void {
    this.reportFailure("quote.rejected", error, "quote", { action: "quote", ...comparison });
  }
  onOrderPrepared(order: RePermitOrder): void {
    if (this.isDisabled || this.preparedOrders.has(order)) return;
    const { witness } = order;
    const values = contextData({
      account: witness.swapper, chainId: witness.chainid, inputTokenAddress: witness.input.token,
      outputTokenAddress: witness.output.token, inputAmountRaw: witness.input.maxAmount,
      inputAmountPerTradeRaw: witness.input.amount, minimumOutputAmountRaw: witness.output.limit,
      deadlineMillis: Number(order.deadline) * 1000, fillDelayMillis: witness.epoch * 1000,
      slippagePercent: witness.slippage / 100,
    });
    this.preparedOrders.add(order);
    void this.emitEvent("order.prepared", { ...CLEAR_ERROR_FIELDS, ...selectData(this.data, TRADE_FIELDS), ...values, action: "execution" });
  }
  onCancelOrderRequest(cancelOrderIds: string[], version: 1 | 2): void {
    if (this.isDisabled) return;
    this.resetErrors();
    const ids = Array.isArray(cancelOrderIds) && (version === 1 || version === 2)
      ? cancelOrderIds.filter(id => typeof id === "string" && id.trim())
      : [];
    this.cancellationTargets = [...new Set(ids)].map(cancelOrderId => ({ cancelOrderId, cancelOrderVersion: version }));
    this.emitCancellation("cancellation.requested", {
      action: "cancel order", executionPhase: "cancelling", cancelOrderSuccess: false,
      cancelOrderTxHash: undefined, ...CLEAR_ERROR_FIELDS,
    });
  }
  onCancelOrderSuccess(hash?: string): void {
    this.emitCancellation("cancellation.succeeded", {
      ...CLEAR_ERROR_FIELDS,
      action: "cancel order", cancelOrderTxHash: hash, cancelOrderSuccess: true,
    });
  }
  onCancelOrderError(error: unknown): void {
    // Claim the failure once for the batch, then report every affected target.
    if (this.isDisabled || !this.claimError(error)) return;
    this.emitCancellation("cancellation.failed", {
      ...getErrorDetails(error, "cancelling"), action: "cancel order", cancelOrderSuccess: false,
    });
  }
  onWrapRequest(wrapAmountRaw?: string): void {
    void this.emitEvent("wrap.requested", { ...CLEAR_ERROR_FIELDS, action: "wrap", executionPhase: "wrapping", wrapAmountRaw });
  }
  onWrapSuccess(wrapTxHash?: string): void { void this.emitEvent("wrap.succeeded", { ...CLEAR_ERROR_FIELDS, action: "wrap", wrapTxHash }); }
  onWrapError(error: unknown): void {
    this.reportFailure("wrap.failed", error, "wrapping", { action: "wrap", wrapTxHash: this.data.wrapTxHash });
  }
  onApproveRequest(request?: ApprovalRequest): void {
    void this.emitEvent("approval.requested", {
      ...CLEAR_ERROR_FIELDS, action: "approve", executionPhase: "approving",
      approvalTokenAddress: request?.tokenAddress, approvalSpenderAddress: request?.spenderAddress, approvalAmountRaw: request?.amount,
    });
  }
  onApproveConfirmed(approvalTxHash?: string): void {
    void this.emitEvent("approval.confirmed", { ...CLEAR_ERROR_FIELDS, action: "approve", approvalTxHash });
  }
  onApproveSuccess(approvalTxHash?: string): void { void this.emitEvent("approval.succeeded", { ...CLEAR_ERROR_FIELDS, action: "approve", approvalTxHash }); }
  onApproveError(error: unknown): void {
    this.reportFailure("approval.failed", error, "approving", { action: "approve", approvalTxHash: this.data.approvalTxHash });
  }
  onCrash(error: unknown): void { this.reportFailure("crash", error, "render", { action: "crash" }); }
  onTxError(error: unknown): void { this.reportFailure("execution.failed", error, this.data.executionPhase, { action: this.data.action }); }

  onRequestOrder({ account, chainId, module, srcToken, dstToken, fromTokenAmount, srcChunkAmount,
    minDstAmountOutPerTrade = "", triggerPricePerTrade = "", deadline, fillDelay, slippage, isMarketOrder, chunksAmount,
  }: {
    account: string; chainId: number; module: Module; srcToken: Token; dstToken: Token;
    fromTokenAmount: string; srcChunkAmount: string; minDstAmountOutPerTrade: string; triggerPricePerTrade: string;
    deadline: number; fillDelay: number; slippage: number; isMarketOrder: boolean; chunksAmount: number;
  }): void {
    void this.emitEvent("order.requested", { ...CLEAR_ERROR_FIELDS, action: "execution", ...contextData({
      account, chainId, module, inputTokenAddress: srcToken.address, inputTokenSymbol: srcToken.symbol,
      outputTokenAddress: dstToken.address, outputTokenSymbol: dstToken.symbol, inputAmountRaw: fromTokenAmount,
      inputAmountPerTradeRaw: srcChunkAmount, minimumOutputAmountRaw: minDstAmountOutPerTrade,
      triggerOutputAmountPerTradeRaw: triggerPricePerTrade, deadlineMillis: deadline, fillDelayMillis: fillDelay,
      slippagePercent: slippage, isMarketOrder, totalTrades: chunksAmount,
    }) });
  }
  onSignOrderRequest(_order: RePermitOrder): void { void this.emitEvent("signing.requested", { ...CLEAR_ERROR_FIELDS, action: "sign order", executionPhase: "signing" }); }
  onSignOrderError(error: unknown): void { this.reportFailure("signing.failed", error, "signing", { action: "sign order" }); }
  onSignOrderSuccess(_signature: string): void { void this.emitEvent("signing.succeeded", { ...CLEAR_ERROR_FIELDS, action: "sign order" }); }

  init(partner: Partners, permitData: RePermitData): void {
    const details = getFetchedConfigDetails(permitData, partner), key = JSON.stringify(details);
    if (key === this.moduleImportKey) return;
    this.moduleImportKey = key;
    this.configDetails = details;
    this.data = { ...baseData(), ...details, action: "module-import" };
    this.eventSequence = 0;
    this.resetSettlement();
    this.cancellationTargets = [];
    if (!this.operationScoped) void this.emitEvent("configuration.loaded", { ...details, action: "module-import" });
  }
  onCreateOrderRequest(): void { void this.emitEvent("submission.requested", { ...CLEAR_ERROR_FIELDS, action: "create order", executionPhase: "submitting" }); }
  onCreateOrderError(error: unknown): void { this.reportFailure("submission.failed", error, "submitting", { action: "create order" }); }
  async onCreateOrderSuccess(orderHash?: string): Promise<void> {
    if (this.isDisabled) return;
    const delivery = this.emitEvent("submission.succeeded", {
      ...CLEAR_ERROR_FIELDS, action: "create order", executionPhase: "submitted", orderHash,
      orderSuccess: true, orderSubmitted: true,
    });
    if (!this.operationScoped) {
      this.data = { ...baseData(), ...this.configDetails, action: "reset" };
      this.resetErrors();
      this.resetSettlement();
      this.cancellationTargets = [];
      this.executionStarted = false;
      this.eventSequence = 0;
    }
    await delivery;
  }
  onSettlementUpdate(order: Order): void {
    if (this.isDisabled || !this.isSwapSettlement(order)) return;
    const key = JSON.stringify([order.id, order.status, order.progress, order.srcAmountFilled, order.dstAmountFilled]);
    if (key === this.settlementKey) return;
    this.settlementKey = key;
    const filled = order.status === OrderStatus.Completed;
    const status = filled ? "filled" : order.status === OrderStatus.Cancelled ? "cancelled" : order.status === OrderStatus.Expired ? "expired" : "pending";
    this.terminalSettlement = status === "pending" ? undefined : { id: order.id, status: order.status };
    void this.emitEvent(`settlement.${status === "pending" ? "updated" : status}`, {
      action: "settlement", orderHash: order.id,
      orderFilled: filled, orderProgress: order.progress,
      executionPhase: status === "pending" ? "settling" : filled ? "success" : "failed",
      filledInputAmountRaw: order.srcAmountFilled, filledOutputAmountRaw: order.dstAmountFilled,
      ...CLEAR_ERROR_FIELDS,
    });
  }
  onSettlementError(error: unknown, order?: Pick<Order, "type">): void {
    if (this.isDisabled || !this.isSwapSettlement(order)) return;
    const reason = errorField(error, "reason");
    const status = ["cancelled", "expired", "unconfirmed", "aborted"].includes(String(reason)) ? String(reason) : "error";
    const orderId = scalarErrorField(error, "orderId") ?? this.data.orderHash;
    // watchOrder yields a terminal snapshot before throwing its corresponding error.
    const terminal = this.terminalSettlement;
    const terminalAlreadyReported = terminal && orderId === terminal.id &&
      (terminal.status === OrderStatus.Completed ||
        status === "cancelled" && terminal.status === OrderStatus.Cancelled ||
        status === "expired" && terminal.status === OrderStatus.Expired);
    if (terminalAlreadyReported) {
      this.claimError(error);
      return;
    }
    this.reportFailure(`settlement.${status === "error" ? "failed" : status}`, error, "settlement", {
      action: "settlement", orderHash: typeof orderId === "string" ? orderId : undefined,
    });
  }
  onRecoveryError(error: unknown): void {
    this.reportFailure("recovery.failed", error, "recovery", { action: "recovery", orderHash: this.data.orderHash });
  }
  onRecoveryRequest(): void {
    if (this.isDisabled) return;
    this.resetErrors();
    this.resetSettlement();
    this.cancellationTargets = [];
    void this.emitEvent("recovery.requested", {
      ...CLEAR_ERROR_FIELDS, action: "recovery", orderHash: this.data.orderHash,
      executionPhase: this.data.module === Module.SWAP ? "settling" : "recovering",
    });
  }
}

export type SpotAnalytics = Analytics;

/** Creates context-aware fallback telemetry without emitting an initialization event. */
export function createAnalytics(context: AnalyticsContext = {}, options: { disableAnalytics?: boolean } = {}): SpotAnalytics {
  try { return new Analytics(options.disableAnalytics).createOperation(context); }
  catch { return new Analytics(true, true); }
}

/** A custom observer must not make operation setup part of trading's failure path. */
export function createAnalyticsOperation(reporter: SpotAnalytics, context: AnalyticsContext = {}): SpotAnalytics {
  try {
    const operation = reporter.createOperation(context);
    return policies.has(operation) ? operation : createAnalytics({}, { disableAnalytics: true });
  }
  catch { return createAnalytics({}, { disableAnalytics: true }); }
}

/** Fresh client attribution with the provider's policy, never its previous trade/config data. */
export function createClientAnalytics(parent?: SpotAnalytics, disabled = false): SpotAnalytics {
  try {
    // An explicit client opt-out must not disable sibling clients sharing its provider.
    const policy = !disabled && parent ? policies.get(parent) : undefined;
    return new Analytics(disabled || Boolean(parent?.isDisabled), false, policy);
  } catch { return new Analytics(true); }
}

/** Only an operation owned by this client may inherit its telemetry configuration. */
export function resolveAnalyticsReporter(owner: SpotAnalytics, provided?: SpotAnalytics, context: AnalyticsContext = {}): SpotAnalytics {
  try {
    if (provided && attributionScopes.has(owner) && attributionScopes.get(provided) === attributionScopes.get(owner)) return provided;
    if (provided?.isDisabled) return createAnalytics(context, { disableAnalytics: true });
    return createAnalyticsOperation(owner, context);
  } catch { return createAnalytics({}, { disableAnalytics: true }); }
}
function isObject(value: unknown): value is object { return typeof value === "object" && value !== null; }
export function bindOrderAnalytics(order: RePermitOrder, reporter: SpotAnalytics): void {
  if (isObject(order)) orderAnalytics.set(order, reporter);
}
export function getOrderAnalytics(order: RePermitOrder): SpotAnalytics | undefined {
  return isObject(order) ? orderAnalytics.get(order) : undefined;
}
export function bindSubmittedOrderAnalytics(order: Order, reporter: SpotAnalytics): void {
  if (isObject(order)) submittedAnalytics.set(order, reporter);
}
export function getSubmittedOrderAnalytics(order: Order): SpotAnalytics | undefined {
  return isObject(order) ? submittedAnalytics.get(order) : undefined;
}

/** @deprecated Use client.analytics for client-scoped events. */
export const analytics = new Analytics();

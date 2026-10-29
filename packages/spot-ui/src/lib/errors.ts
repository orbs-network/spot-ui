/** Stable classifications for SDK-owned failures. Wallet, quote, and settlement errors keep their own contracts. */
export type SpotErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_CONFIGURATION"
  | "CONFIGURATION_FAILED"
  | "FORM_NOT_SUBMITTABLE"
  | "UNSUPPORTED_SWAP"
  | "QUOTE_CONTEXT_MISMATCH"
  | "INVALID_QUOTE"
  | "INVALID_AMOUNT"
  | "EXECUTION_IN_PROGRESS"
  | "WRAP_FAILED"
  | "APPROVAL_FAILED"
  | "INSUFFICIENT_ALLOWANCE"
  | "PREPARED_ORDER_MISMATCH"
  | "SUBMISSION_FAILED"
  | "INVALID_RESPONSE"
  | "CANCELLATION_UNAVAILABLE"
  | "HISTORY_FAILED"
  | "ORDER_LOOKUP_FAILED";

/** Optional transport details retained on a {@link SpotError}. */
export interface SpotErrorOptions {
  /** Original failure when the SDK translates a transport or response error. */
  cause?: unknown;
  /** HTTP response status, when a response was received. */
  status?: number;
  /** Original service error code, separate from the stable SDK classification. */
  serviceCode?: string | number;
}

/**
 * SDK-owned failure that can be handled by `code` without matching message text.
 * Wallet rejections, host validation errors, abort errors, QuoteError, and
 * OrderSettlementError are propagated through their existing error contracts.
 * A submission transport failure or malformed acceptance response may occur after
 * acceptance; check order status before retrying a signed order.
 */
export class SpotError extends Error {
  readonly name = "SpotError";
  /** Stable SDK classification for application error handling. */
  readonly code: SpotErrorCode;
  /** Original underlying failure, when available. */
  readonly cause?: unknown;
  /** HTTP response status, when available. */
  readonly status?: number;
  /** Original service error code, when available. */
  readonly serviceCode?: string | number;

  constructor(code: SpotErrorCode, message: string, options: SpotErrorOptions = {}) {
    super(message);
    this.code = code;
    this.cause = options.cause;
    this.status = options.status;
    this.serviceCode = options.serviceCode;
  }
}

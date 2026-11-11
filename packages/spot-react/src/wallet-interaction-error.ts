/** Failures owned by the React host's wallet transaction and allowance flow. */
export type WalletInteractionErrorCode =
  | "WRAP_FAILED"
  | "APPROVAL_FAILED"
  | "INSUFFICIENT_ALLOWANCE";

/**
 * A wallet prerequisite failed before the host could sign or submit an order.
 * Handle `code` to distinguish failed wrapping, failed approval confirmation,
 * and allowance that remains insufficient after the host's approval attempts.
 * Protocol preparation/submission failures retain the core SDK's `SpotError`.
 * Original wallet rejections and read errors propagate unchanged.
 *
 * @example
 * if (error instanceof WalletInteractionError) {
 *   showWalletError(error.code, error.message);
 * }
 */
export class WalletInteractionError extends Error {
  readonly name = "WalletInteractionError";
  /** Stable wallet-flow classification for host error handling. */
  readonly code: WalletInteractionErrorCode;
  /** Original underlying failure, when the host translates one. */
  readonly cause?: unknown;

  /**
   * @param code - Wallet prerequisite that failed or still needs attention.
   * @param message - Description suitable for the host's error display.
   * @param options - Optional original failure retained as `cause`.
   */
  constructor(code: WalletInteractionErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message);
    this.code = code;
    this.cause = options.cause;
  }
}

const isUserRejectionMessage = (message: string): boolean =>
  /\buser\b.{0,80}\b(?:rejected|denied|cancelled|canceled)\b/i.test(message) ||
  /\brequest\b\s+(?:was\s+)?\b(?:rejected|denied|cancelled|canceled)\b/i.test(message) ||
  /\b(?:rejected|denied|cancelled|canceled)\b.{0,80}\bby\s+(?:the\s+)?user\b/i.test(message);

/**
 * Recognizes common wallet prompt rejection codes and messages, including a
 * nested `error` or `cause`. React uses this to distinguish a declined wallet
 * prompt from a failed transaction or an unavailable order service.
 */
export const isTxRejected = (error: unknown): boolean => {
  const candidates: unknown[] = [error];
  if (typeof error === "object" && error !== null) {
    candidates.push(Reflect.get(error, "error"), Reflect.get(error, "cause"));
  }

  return candidates.some(candidate => {
    if (typeof candidate !== "object" || candidate === null) {
      return typeof candidate === "string" && isUserRejectionMessage(candidate);
    }
    const code = Reflect.get(candidate, "code");
    if (code === 4001 || code === "4001" || code === "ACTION_REJECTED" ||
      code === "USER_REJECTED" || code === "USER_DENIED") return true;
    const message = Reflect.get(candidate, "message");
    return typeof message === "string" && isUserRejectionMessage(message);
  });
};

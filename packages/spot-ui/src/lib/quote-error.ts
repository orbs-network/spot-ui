export type QuoteErrorKind = "invalid-request" | "network" | "http" | "no-quote" | "invalid-response";

/** Cancellation can come from another realm or a transport's error object. */
export const isQuoteAbortError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";

/**
 * Quote failure classified by `kind`, with optional HTTP `status` and service `code`.
 * `retryable` is true for network failures, HTTP 429, and HTTP 5xx responses.
 */
export class QuoteError extends Error {
  readonly name = "QuoteError";
  readonly retryable: boolean;
  constructor(message: string, readonly kind: QuoteErrorKind, readonly status?: number, readonly code?: string | number) {
    super(message);
    this.retryable = kind === "network" || status === 429 || (status !== undefined && status >= 500);
  }
}


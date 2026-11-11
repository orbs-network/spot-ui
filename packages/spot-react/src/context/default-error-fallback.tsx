import type { SpotErrorFallbackProps } from "../types";

export const DefaultErrorFallback = ({ error, retry, isRetrying }: SpotErrorFallbackProps) => (
  <div className="spot-error-fallback" role="alert">
    <p>{error.message || "Something went wrong."}</p>
    <button type="button" className="spot-error-retry" disabled={isRetrying} onClick={retry}>
      {isRetrying ? "Retrying…" : "Retry"}
    </button>
  </div>
);

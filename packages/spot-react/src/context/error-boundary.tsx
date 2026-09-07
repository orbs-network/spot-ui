import { analytics } from "@orbs-network/spot-ui";
import { Component, type ComponentType, type ReactNode } from "react";
import type { SpotErrorFallbackProps } from "../types";

const DefaultErrorFallback = ({
  resetErrorBoundary,
}: SpotErrorFallbackProps) => (
  <div className="twap-error-fallback" role="alert">
    <p>Something went wrong</p>
    <button type="button" onClick={resetErrorBoundary}>
      Retry
    </button>
  </div>
);

export const SpotErrorBoundary = ({
  children,
  fallback: ErrorFallback = DefaultErrorFallback,
}: {
  children: ReactNode;
  fallback?: ComponentType<SpotErrorFallbackProps>;
}) => (
  <InternalErrorBoundary fallback={ErrorFallback}>
    {children}
  </InternalErrorBoundary>
);

interface InternalErrorBoundaryProps {
  children: ReactNode;
  fallback: ComponentType<SpotErrorFallbackProps>;
}

interface InternalErrorBoundaryState {
  error?: Error;
}

class InternalErrorBoundary extends Component<
  InternalErrorBoundaryProps,
  InternalErrorBoundaryState
> {
  state: InternalErrorBoundaryState = {};

  static getDerivedStateFromError(
    error: Error,
  ): InternalErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    analytics.onCrash(error);
  }

  private resetErrorBoundary = (): void => {
    this.setState({ error: undefined });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      const ErrorFallback = this.props.fallback;
      return (
        <ErrorFallback
          error={error}
          resetErrorBoundary={this.resetErrorBoundary}
        />
      );
    }

    return this.props.children;
  }
}

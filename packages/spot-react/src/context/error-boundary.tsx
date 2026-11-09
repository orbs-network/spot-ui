import { Component, useCallback, type ComponentType, type ReactNode } from "react";
import type { SpotErrorFallbackProps } from "../types";
import { useClient } from "./use-client";
import { useSpotTrading } from "./spot-trading-context";
import { createOperationAnalytics } from "../analytics";
import { observe } from "../execution-state";

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
}) => {
  const { data: client } = useClient();
  const { partner, chainId, account, module, inputToken, outputToken, disableAnalytics } = useSpotTrading();
  const reportCrash = useCallback((error: Error) => {
    const reporter = createOperationAnalytics({
      partner,
      chainId,
      account,
      module,
      inputTokenAddress: inputToken?.address,
      inputTokenSymbol: inputToken?.symbol,
      outputTokenAddress: outputToken?.address,
      outputTokenSymbol: outputToken?.symbol,
    }, client, disableAnalytics);
    observe(() => reporter.onCrash(error));
  }, [client, partner, chainId, account, module, inputToken, outputToken, disableAnalytics]);
  return (
    <InternalErrorBoundary fallback={ErrorFallback} reportCrash={reportCrash}>
      {children}
    </InternalErrorBoundary>
  );
};

interface InternalErrorBoundaryProps {
  children: ReactNode;
  fallback: ComponentType<SpotErrorFallbackProps>;
  reportCrash: (error: Error) => void;
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
    this.props.reportCrash(error);
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

import { Component, useCallback, type ComponentType, type ReactNode } from "react";
import type { SpotErrorFallbackProps } from "../types";
import { useClient } from "./use-client";
import { useSpotTrading } from "./spot-trading-context";
import { createOperationAnalytics } from "../analytics";
import { observe } from "../execution-state";
import { DefaultErrorFallback } from "./default-error-fallback";

export const SpotErrorBoundary = ({
  children,
  fallback: ErrorFallback = DefaultErrorFallback,
}: {
  children: ReactNode;
  fallback?: ComponentType<SpotErrorFallbackProps>;
}) => {
  const { data: client } = useClient();
  const { partner, chainId, account, orderType, inputToken, outputToken } = useSpotTrading();
  const reportCrash = useCallback((error: Error) => {
    const reporter = createOperationAnalytics({
      partner,
      chainId,
      account,
      orderType,
      inputTokenAddress: inputToken?.address,
      inputTokenSymbol: inputToken?.symbol,
      outputTokenAddress: outputToken?.address,
      outputTokenSymbol: outputToken?.symbol,
    }, client);
    observe(() => reporter.onCrash(error));
  }, [client, partner, chainId, account, orderType, inputToken, outputToken]);
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

  private retry = async (): Promise<void> => {
    this.setState({ error: undefined });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      const ErrorFallback = this.props.fallback;
      return (
        <ErrorFallback
          error={error}
          retry={this.retry}
          isRetrying={false}
        />
      );
    }

    return this.props.children;
  }
}

import type { SpotProps } from "../types";
import { ClientErrorNotice } from "./client-error-notice";
import { SpotErrorBoundary } from "./error-boundary";
import { SpotFormSynchronizer } from "./spot-form-synchronizer";
import { OrderFormProvider } from "./order-form-context";
import { SpotStoreProvider } from "./spot-store";
import { useSpotAnalytics } from "./use-spot-analytics";
import { useSpotProviderState } from "./use-spot-provider-state";

export const SpotProvider = (props: SpotProps) => {
  const { initialState, formScopeKey, runtime } = useSpotProviderState(props);
  useSpotAnalytics(props, runtime.isSupportedChain);

  return (
    <SpotStoreProvider runtime={runtime} initialState={initialState}>
      <SpotErrorBoundary fallback={props.errorFallback}>
        <SpotFormSynchronizer
          defaults={initialState}
          scopeKey={formScopeKey}
        >
          <ClientErrorNotice fallback={props.clientErrorFallback}>
            <OrderFormProvider>{props.children}</OrderFormProvider>
          </ClientErrorNotice>
        </SpotFormSynchronizer>
      </SpotErrorBoundary>
    </SpotStoreProvider>
  );
};

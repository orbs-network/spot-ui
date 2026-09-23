import { SpotResources } from "./spot-resources";
import type { SpotProps } from "../types";
import { ClientErrorNotice } from "./client-error-notice";
import { SpotErrorBoundary } from "./error-boundary";
import { SpotFormSynchronizer } from "./spot-form-synchronizer";
import { OrderFormProvider } from "./order-form-context";
import { SpotTradingProvider } from "./spot-trading-context";
import { SpotStoreProvider } from "./spot-store-context";
import { useSpotProviderState } from "./use-spot-provider-state";

export const SpotProvider = (props: SpotProps) => {
  const { initialState, formScopeKey, trading } = useSpotProviderState(props);

  return (
    <SpotTradingProvider value={trading}>
      <SpotStoreProvider initialState={initialState}>
        <SpotErrorBoundary fallback={props.errorFallback}>
          <SpotResources>
            <SpotFormSynchronizer
              defaults={initialState}
              scopeKey={formScopeKey}
            >
              <ClientErrorNotice fallback={props.clientErrorFallback}>
                <OrderFormProvider>{props.children}</OrderFormProvider>
              </ClientErrorNotice>
            </SpotFormSynchronizer>
          </SpotResources>
        </SpotErrorBoundary>
      </SpotStoreProvider>
    </SpotTradingProvider>
  );
};

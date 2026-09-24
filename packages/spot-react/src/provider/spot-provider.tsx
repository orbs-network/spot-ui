import { ClientErrorNotice } from "../client/client-error-notice";
import { OrderFormProvider } from "../form/form-context";
import { SpotFormSynchronizer } from "../form/form-synchronizer";
import { SpotStoreProvider } from "../store/store-context";
import { SpotErrorBoundary } from "./error-boundary";
import { SpotResources } from "./resources";
import { SpotTradingProvider } from "./trading-context";
import type { SpotProps } from "./types";
import { useSpotProviderState } from "./use-provider-state";

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

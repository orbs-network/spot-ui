import { SpotResources } from "./spot-resources";
import { Module } from "@orbs-network/spot-ui";
import type { AdvancedOrdersProviderProps } from "../types";
import { ClientErrorNotice } from "./client-error-notice";
import { SpotErrorBoundary } from "./error-boundary";
import { SpotFormSynchronizer } from "./spot-form-synchronizer";
import { OrderFormProvider } from "./order-form-context";
import { SpotTradingProvider } from "./spot-trading-context";
import { SpotStoreProvider } from "./spot-store-context";
import { useAdvancedOrdersProviderState } from "./use-advanced-orders-provider-state";

const assertAdvancedModule = (module: unknown): void => {
  switch (module) {
    case Module.TWAP:
    case Module.LIMIT:
    case Module.STOP_LOSS:
    case Module.TAKE_PROFIT:
      return;
    default:
      throw new Error("AdvancedOrdersProvider supports TWAP, Limit, Stop-Loss, and Take-Profit orders. Use createClient and client.executeSwap for swaps without a provider.");
  }
};

/** Owns React form state, wallet execution, and history for advanced orders. */
export const AdvancedOrdersProvider = (props: AdvancedOrdersProviderProps) => {
  // Validate JavaScript callers before creating state or mounting resource effects.
  assertAdvancedModule(props.module);
  const { initialState, formScopeKey, trading } = useAdvancedOrdersProviderState(props);

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

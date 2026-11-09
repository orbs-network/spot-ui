import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import {
  createSpotStore,
  type SpotFormDefaults,
  type SpotStore,
} from "./create-spot-store";
import { useSpotTrading } from "./spot-trading-context";

const SpotStoreContext = createContext<StoreApi<SpotStore> | null>(null);

export const SpotStoreProvider = ({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState: SpotFormDefaults;
}) => {
  const [store] = useState(() => createSpotStore(initialState));
  const { account, chainId, partner } = useSpotTrading();
  const walletScope = JSON.stringify([account?.toLowerCase(), chainId, partner]);

  // Stop pending wallet steps when their account or network changes. Submitted
  // orders can keep tracking without the original wallet.
  useEffect(() => {
    return () => store.getState().abortExecutionTask(true);
  }, [store, walletScope]);

  // Execution belongs to this provider, so closing a control does not stop it.
  useEffect(() => {
    return () => store.getState().abortExecutionTask();
  }, [store]);

  return (
    <SpotStoreContext.Provider value={store}>
      {children}
    </SpotStoreContext.Provider>
  );
};

export const useSpotStoreApi = (): StoreApi<SpotStore> => {
  const store = useContext(SpotStoreContext);
  if (store === null) {
    throw new Error("useSpotStore must be used within AdvancedOrdersProvider");
  }
  return store;
};

export const useSpotStore = <T,>(selector: (store: SpotStore) => T): T => {
  const store = useSpotStoreApi();
  return useStore(store, selector);
};

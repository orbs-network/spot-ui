import {
  createContext,
  useContext,
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

const SpotStoreContext = createContext<StoreApi<SpotStore> | null>(null);

export const SpotStoreProvider = ({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState: SpotFormDefaults;
}) => {
  const [store] = useState(() => createSpotStore(initialState));

  return (
    <SpotStoreContext.Provider value={store}>
      {children}
    </SpotStoreContext.Provider>
  );
};

export const useSpotStoreApi = (): StoreApi<SpotStore> => {
  const store = useContext(SpotStoreContext);
  if (store === null) {
    throw new Error("useSpotStore must be used within SpotProvider");
  }
  return store;
};

export const useSpotStore = <T,>(selector: (store: SpotStore) => T): T => {
  const store = useSpotStoreApi();
  return useStore(store, selector);
};

import { Module } from "@orbs-network/spot-react";
import { createContext, useContext, type ReactNode } from "react";

interface SpotFormContextValue {
  swapModule: Module;
  setInputAmount: (value: string) => void;
}

const SpotFormContext = createContext<SpotFormContextValue | null>(null);

export const SpotFormContextProvider = ({
  children,
  value,
}: {
  children: ReactNode;
  value: SpotFormContextValue;
}) => (
  <SpotFormContext.Provider value={value}>
    {children}
  </SpotFormContext.Provider>
);

export const useSpotFormContext = (): SpotFormContextValue => {
  const context = useContext(SpotFormContext);
  if (context === null) {
    throw new Error("useSpotFormContext must be used within SpotForm");
  }
  return context;
};

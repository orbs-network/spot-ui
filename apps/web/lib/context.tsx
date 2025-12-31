import { createContext, useEffect, useRef } from "react";
import { useConnection } from "wagmi";
import { useSwapParams } from "./hooks/use-swap-params";
import { setApiMode } from "@orbs-network/spot-react";

const Context = createContext({});

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { chainId } = useConnection();
  const { setCurrencies } = useSwapParams();
  const chainRef = useRef<number | undefined>(undefined);

  // Hydrate persisted Zustand stores on client

  // Set API mode on client side only
  useEffect(() => {
    const mode = process.env.NEXT_PUBLIC_MODE;
    if (mode) {
      setApiMode(mode as "prod" | "dev");
    }
  }, []);

  useEffect(() => {
    if (chainRef.current && chainRef.current !== chainId) {
      setCurrencies({ inputCurrency: undefined, outputCurrency: undefined });
    }
    chainRef.current = chainId;
  }, [chainId, setCurrencies]);

  return <Context.Provider value={{}}>{children}</Context.Provider>;
};

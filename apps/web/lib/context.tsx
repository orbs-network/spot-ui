import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";
import { createContext, useEffect, useRef } from "react";
import { useSwapParams } from "./hooks/use-swap-params";

const Context = createContext({});

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const chainId = useActiveChainId();
  const { setCurrencies } = useSwapParams();
  const chainRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (chainRef.current && chainRef.current !== chainId) {
      setCurrencies({ inputCurrency: undefined, outputCurrency: undefined });
    }
    chainRef.current = chainId;
  }, [chainId, setCurrencies]);

  return <Context.Provider value={{}}>{children}</Context.Provider>;
};

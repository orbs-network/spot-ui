import { createContext, useEffect } from "react";
import { useConnection } from "wagmi";
import { useSwapParams } from "./hooks/use-swap-params";

const Context = createContext({})

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { chainId } = useConnection();
  const { setCurrencies } = useSwapParams();
  useEffect(() => {
    setCurrencies({ inputCurrency: undefined, outputCurrency: undefined });
  }, [chainId, setCurrencies]);
  
  return (
    <Context.Provider value={{}}>
      {children}
    </Context.Provider>
  );
};
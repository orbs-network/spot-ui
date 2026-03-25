import { createContext, useEffect, useRef } from "react";
import { useConnection, useSwitchChain } from "wagmi";
import { useSwapParams } from "./hooks/use-swap-params";

const Context = createContext({});

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { chainId } = useConnection();
  const { setCurrencies, targetChainId } = useSwapParams();
  const switchChain = useSwitchChain();
  const chainRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (chainRef.current && chainRef.current !== chainId) {
      setCurrencies({ inputCurrency: undefined, outputCurrency: undefined });
    }
    chainRef.current = chainId;
  }, [chainId, setCurrencies]);

  useEffect(() => {
    if (chainId && targetChainId && chainId !== Number(targetChainId)) {
      switchChain.mutate({ chainId: Number(targetChainId) });
    }
  }, [targetChainId, chainId, switchChain]);

  return <Context.Provider value={{}}>{children}</Context.Provider>;
};

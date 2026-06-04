import { createContext } from "react";

const Context = createContext({});

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return <Context.Provider value={{}}>{children}</Context.Provider>;
};

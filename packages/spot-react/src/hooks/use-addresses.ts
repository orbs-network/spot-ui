
import { useMemo } from "react";
import { useSpotContext } from "../spot-context";

export const useAddresses = () => {
  const { config } = useSpotContext();
  return useMemo(() => {
    return {
      spender: config?.repermit ?? "",
    }
  }, [config])
};

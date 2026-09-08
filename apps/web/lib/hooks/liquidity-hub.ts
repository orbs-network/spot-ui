import { createClient } from "@orbs-network/liquidity-hub-sdk";
import { useMemo } from "react";
import { useConnection } from "wagmi";

const localApiUrl =
  process.env.NODE_ENV === "development" ? "/api/liquidity-hub" : undefined;

export const useLiquidityHub = () => {
  const { chainId } = useConnection();
  return useMemo(
    () =>
      createClient({
        chainId: chainId || 1,
        partner: "playground",
        apiUrl: localApiUrl,
      }),
    [chainId],
  );
};

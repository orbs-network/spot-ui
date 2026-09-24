import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";
import { createClient } from "@orbs-network/liquidity-hub-sdk";
import { useMemo } from "react";

const localApiUrl =
  process.env.NODE_ENV === "development" ? "/api/liquidity-hub" : undefined;

export const useLiquidityHub = () => {
  const chainId = useActiveChainId();
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

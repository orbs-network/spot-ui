import { constructSDK } from "@orbs-network/liquidity-hub-sdk";
import { useSwapParams } from "./use-swap-params";

export const useLiquidityHub = () => {
  const { chainId } = useSwapParams();
  return constructSDK({ chainId: chainId || 1, partner: "playground" });
};

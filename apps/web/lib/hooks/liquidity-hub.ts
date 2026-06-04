import { constructSDK } from "@orbs-network/liquidity-hub-sdk";
import { useUtilaWalletSession } from "./use-utila-wallet-session";

export const useLiquidityHub = () => {
  const { chainId } = useUtilaWalletSession();
  return constructSDK({ chainId: chainId || 1, partner: "playground" });
};

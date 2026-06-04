"use client";

import { usePathname } from "next/navigation";
import { useConnection } from "wagmi";
import { useUtilaStore } from "./store";
import { useSwapParams } from "./use-swap-params";

export const useUtilaWalletSession = () => {
  const {
    address: connectedAddress,
    chainId: connectedChainId,
    isConnected,
  } = useConnection();
  const { targetChainId } = useSwapParams();
  const pathname = usePathname();
  const {
    vaultId: storeVaultId,
    walletAddress: storeWalletAddress,
  } = useUtilaStore();
  const isUtila = pathname.startsWith("/utila");
  const utilaAddress = isUtila ? storeWalletAddress : undefined;
  const vaultId = isUtila ? storeVaultId : undefined;
  const address = isUtila ? utilaAddress : connectedAddress;
  const chainId =
    isUtila
      ? targetChainId
        ? Number(targetChainId)
        : undefined
      : connectedChainId ?? (targetChainId ? Number(targetChainId) : undefined);

  return {
    address,
    chainId,
    connectedAddress,
    hasUtilaSession: Boolean(utilaAddress),
    isConnected: isUtila ? Boolean(utilaAddress) : isConnected,
    isWalletConnected: isUtila ? false : isConnected,
    rawWalletAddress: storeWalletAddress ?? "",
    utilaAddress,
    vaultId,
  };
};

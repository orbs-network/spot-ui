import { useUtilaFormStore } from "./store";
import { useUtilaWalletSession } from "./use-utila-wallet-session";

export const useUtilaSelectedWallet = () => {
  const { address } = useUtilaWalletSession();
  const selectedWalletAddress = useUtilaFormStore(
    (state) => state.selectedWalletAddress,
  );
  const selectWallet = useUtilaFormStore((state) => state.selectWallet);
  const clearSelectedWallet = useUtilaFormStore(
    (state) => state.clearSelectedWallet,
  );
  const validSelectedWalletAddress =
    address &&
    selectedWalletAddress?.toLowerCase() === address.toLowerCase()
      ? selectedWalletAddress
      : undefined;

  return {
    clearSelectedWallet,
    selectedWalletAddress: validSelectedWalletAddress,
    selectWallet,
  };
};

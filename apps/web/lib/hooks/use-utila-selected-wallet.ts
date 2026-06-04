import { useUtilaFormStore } from "./store";
import { useActiveConnection } from "./use-active-connection";

export const useUtilaSelectedWallet = () => {
  const { address } = useActiveConnection();
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

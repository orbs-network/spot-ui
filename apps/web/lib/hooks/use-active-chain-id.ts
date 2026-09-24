import { useChainId, useConnection } from "wagmi";

/** Follow the wallet when connected, or wagmi's selected network before connection. */
export const useActiveChainId = (): number => {
  const { chainId } = useConnection();
  const selectedChainId = useChainId();
  return chainId ?? selectedChainId;
};

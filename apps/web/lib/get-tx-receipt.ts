import { getPublicClient } from "./get-public-client";

export const getTxReceipt = async (chainId: number, hash: `0x${string}`) => {
  const publicClient = getPublicClient(chainId);
  const maxRetries = 10;
  let attempt = 0;
  let delay = 1000;

  while (attempt < maxRetries) {
    try {
      let replacementReason: "repriced" | "cancelled" | "replaced" | undefined;
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2,
        retryDelay: delay,
        onReplaced: ({ reason }) => { replacementReason = reason; },
      });
      return { ...receipt, replacementReason };
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts: ${error}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  throw new Error(`Failed after ${maxRetries} attempts`);
};

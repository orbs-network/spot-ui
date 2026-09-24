import type { CancelOrderRequest } from "../client/types";
import { REPERMIT_ABI, TWAP_ABI } from "../contracts/abi";
import type { Address } from "../shared/types";
import type { Order } from "./types";

export const buildCancelOrderRequest = (
  order: Order,
  spenderAddress: Address,
): CancelOrderRequest => {
  const contractAddress =
    order.version === 1 ? order.twapAddress : spenderAddress;
  if (!contractAddress) {
    throw new Error("Cancellation contract address is unavailable");
  }

  return {
    order,
    contractAddress,
    args: order.version === 1 ? [order.id] : [[order.repermitDigest]],
    abi: order.version === 1 ? TWAP_ABI : REPERMIT_ABI,
  };
};

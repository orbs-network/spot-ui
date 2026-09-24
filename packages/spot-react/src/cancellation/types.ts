import type { Order } from "@orbs-network/spot-ui";

export type OnCancelOrderSuccess = {
  order: Order;
  txHash: `0x${string}`;
};

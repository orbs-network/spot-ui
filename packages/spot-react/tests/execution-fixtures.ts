import type {
  CreateOrderExecutionParams,
  ApprovalRequest,
  ExecutionRunOptions,
  Order,
  OrderExecution,
  OrderExecutionUpdate,
  PreparedOrder,
  OrderWalletInteractions,
} from "@orbs-network/spot-ui";
import { vi } from "vitest";

export type OrderRunParams = CreateOrderExecutionParams & ExecutionRunOptions<PreparedOrder>;
export const suggestedApprovalAmount = (2n ** 256n - 1n).toString();

/** Test double for the SDK boundary: commit getter snapshots before notifying the host. */
export const orderExecution = (
  params: CreateOrderExecutionParams,
  run: (params: OrderRunParams) => Promise<Order>,
  spenderAddress: string,
): OrderExecution => {
  const shouldWrap = params.walletInteractions.shouldWrap.bind(params.walletInteractions);
  const shouldApprove = params.walletInteractions.shouldApprove.bind(params.walletInteractions);
  const approvalRequest: ApprovalRequest = {
    tokenAddress: params.inputTokenAddress, spenderAddress,
    amount: params.form.inputAmount.raw, approvalAmount: suggestedApprovalAmount,
  };
  let wrapped = false;
  let approved = false;
  let snapshot: Partial<OrderExecutionUpdate<PreparedOrder>> = {};
  return {
    get order() { return snapshot.order; },
    get preparedOrder() { return snapshot.preparedOrder; },
    get signature() { return snapshot.signature; },
    get wrapTxHash() { return snapshot.wrapTxHash; },
    get approvalTxHash() { return snapshot.approvalTxHash; },
    shouldWrap: vi.fn(async () => wrapped ? false : shouldWrap()),
    shouldApprove: vi.fn(async () => approved ? false : shouldApprove({ ...approvalRequest })),
    run: vi.fn((options: ExecutionRunOptions<PreparedOrder> = {}) => run({ ...params, onProgress: update => {
      snapshot = { ...snapshot, ...update };
      if (update.phase === "wrapping" && (update.event === "success" || update.event === "skipped")) wrapped = true;
      if (update.phase === "approving" && (update.event === "success" || update.event === "skipped")) approved = true;
      if (["signing", "submitting", "settling"].includes(update.phase)) { wrapped = true; approved = true; }
      options.onProgress?.(update);
    } }).then(order => {
      snapshot = { ...snapshot, order };
      wrapped = true;
      approved = true;
      return order;
    })),
    cancel: () => undefined,
  } as OrderExecution;
};

export const testWallet = (): OrderWalletInteractions & { cancelOrder: () => Promise<`0x${string}`> } => ({
  shouldWrap: vi.fn(() => false), shouldApprove: vi.fn(() => false),
  wrapNativeToken: vi.fn(async () => "0xwrap" as const),
  approveToken: vi.fn(async () => "0xapprove" as const),
  signOrder: vi.fn(async () => "0xsignature" as const), cancelOrder: vi.fn(async () => "0xcancel" as const),
});

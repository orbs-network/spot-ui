import type { ApprovalRequest, OrderSigningRequest, PreparedOrder } from "@orbs-network/spot-ui";
import type { Order } from "@orbs-network/spot-ui";
import { observe } from "./observe";

/** Current wallet or settlement stage of an order execution. */
export type OrderExecutionPhase = "preparing" | "wrapping" | "approving" | "signing" | "submitting" | "settling";
/** Required wallet steps; skipped steps are removed. `create` covers signing and submission. */
export type OrderExecutionStep = "wrap" | "approve" | "create";
/** Minimum prepared payload needed to sign an order and validate spending requirements. */
export interface SignableOrder extends Pick<PreparedOrder, "order" | "signingRequest" | "approvalRequest"> {}

/** Progress for each executed step, including acceptance and settlement before the promise resolves. */
export interface OrderExecutionUpdate<T extends SignableOrder = SignableOrder> {
  phase: OrderExecutionPhase;
  /** `success` completes the current phase; only submitting (advanced orders) or settling (swaps) ends execution. */
  event: "request" | "transaction" | "success" | "skipped" | "prepared" | "error" | "accepted" | "updated";
  error?: unknown;
  /** Required steps, revealed at the first wrapping/approving/signing request; [] while earlier checks settle. Fresh checks may update the plan. */
  steps: OrderExecutionStep[];
  /** Zero-based index in the current plan; 0 while unknown; equals steps.length when execution completes. */
  stepIndex: number;
  hasApproval: boolean;
  wrapAmountRaw?: string;
  wrapTxHash?: string;
  approvalTxHash?: string;
  preparedOrder?: T;
  signature?: `0x${string}`;
  /** Accepted or latest settlement snapshot; retain it if tracking stops. */
  order?: Order;
}

/** Public observers receive detached payloads so presentation code cannot modify signing or settlement. */
export function createExecutionObserver<T extends SignableOrder>(
  onProgress?: (update: OrderExecutionUpdate<T>) => void,
  onSnapshot?: (original: OrderExecutionUpdate<T>, snapshot: OrderExecutionUpdate<T>) => void,
): ((update: OrderExecutionUpdate<T>) => void) | undefined {
  if (!onProgress) return undefined;
  return update => observe(() => {
    const snapshot: OrderExecutionUpdate<T> = {
      ...update,
      steps: [...update.steps],
      ...(update.preparedOrder ? { preparedOrder: structuredClone(update.preparedOrder) } : {}),
      ...(update.order ? { order: structuredClone(update.order) } : {}),
    };
    onSnapshot?.(update, snapshot);
    return onProgress(snapshot);
  });
}

/** Framework-neutral wallet adapter implemented by the host application. */
export interface OrderWalletInteractions {
  /** Decide whether the captured input needs native wrapping. Errors stop execution. */
  shouldWrap(): boolean | Promise<boolean>;
  /** Wrap the reviewed base-unit amount and return its hash after a successful receipt. */
  wrapNativeToken(amountRaw: string): Promise<`0x${string}`>;
  /** Compare live allowance with `request.amount`, including after each approval receipt. `approvalAmount` is only a suggested transaction cap. Errors stop execution. */
  shouldApprove(request: ApprovalRequest): boolean | Promise<boolean>;
  /** Approve `request.approvalAmount` or the host's chosen cap (such as exact `request.amount`), and return the hash after a successful receipt. */
  approveToken(request: ApprovalRequest): Promise<`0x${string}`>;
  /** Sign the supplied EIP-712 data and return the original wallet signature unchanged. */
  signOrder(request: OrderSigningRequest): Promise<`0x${string}`>;
}

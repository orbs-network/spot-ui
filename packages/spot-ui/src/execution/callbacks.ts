import type { Order } from "../orders/types";
import type {
  ObserverResult,
  OnApproveSuccessCallback,
  OnWrapSuccessCallback,
  ParsedError,
} from "./types";

export interface ExecutionCallbacks {
  onSignOrderRequest?: () => ObserverResult;
  onOrderCreated?: (order: Order) => ObserverResult;
  onSignOrderSuccess?: (signature: string) => ObserverResult;
  onSignOrderError?: (error: Error) => ObserverResult;
  onApproveRequest?: () => ObserverResult;
  onApproveSuccess?: (props: OnApproveSuccessCallback) => ObserverResult;
  onWrapRequest?: () => ObserverResult;
  onWrapSuccess?: (props: OnWrapSuccessCallback) => ObserverResult;
  onSubmitOrderFailed?: (error: ParsedError) => ObserverResult;
  onSubmitOrderRejected?: () => ObserverResult;
}

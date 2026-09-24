import type {
  ExecutionCallbacks,
  ObserverResult,
  Order,
  TimeDuration,
} from "@orbs-network/spot-ui";
import { type OnCancelOrderSuccess } from "../cancellation/types";

export interface Callbacks extends ExecutionCallbacks {
  onCancelOrderRequest?: (order: Order) => ObserverResult;
  onCancelOrderSuccess?: (props: OnCancelOrderSuccess) => ObserverResult;
  onCancelOrderFailed?: (error: Error) => ObserverResult;
  onOrdersProgressUpdate?: (orders: Order[]) => ObserverResult;
  onOrderFilled?: (order: Order) => ObserverResult;
  onCopy?: () => ObserverResult;

  onLimitPriceChange?: (limitPriceUi: string) => ObserverResult;
  onTriggerPriceChange?: (triggerPriceUi: string) => ObserverResult;
  onTriggerPricePercentChange?: (triggerPricePercent: string) => ObserverResult;
  onLimitPricePercentChange?: (limitPricePercent: string) => ObserverResult;
  onOrderDurationChange?: (orderDuration?: TimeDuration) => ObserverResult;
  onTradeIntervalChange?: (tradeInterval?: TimeDuration) => ObserverResult;
  onTradeCountChange?: (tradeCount: number) => ObserverResult;
}

/** @internal Wallet sequencing and UI progress owned by React/demo hosts, outside the protocol client API. */
export { createHostOrderExecution, createHostSwapExecution, type CreateOrderExecutionParams, type CreateSwapExecutionParams } from "./host-execution/create-execution";
export type { OrderWalletInteractions, OrderExecutionUpdate, OrderExecutionPhase, OrderExecutionStep, SignableOrder } from "./host-execution/progress";
export type { OrderExecution, SwapExecution, ExecutionRunOptions, TransactionStepResult } from "./host-execution/types";
export { OrderSettlementError } from "./host-execution/order-settlement-error";
export { WalletInteractionError, isTxRejected, type WalletInteractionErrorCode } from "./wallet-interaction-error";
export type { AllowanceRequest } from "./types";

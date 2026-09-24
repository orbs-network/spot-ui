import { type SpotAnalytics } from "../analytics/analytics";
import type { Partners } from "../config/partners";
import type { RePermitData } from "../config/types";
import { REPERMIT_ABI, TWAP_ABI } from "../contracts/abi/index";
import type { RePermitOrder } from "../contracts/types";
import {
  type AccountOrdersResult,
  type GetAccountOrdersParams,
} from "../history/get-account-orders";
import type {
  CalculatedOrderForm,
  CalculatedOrderValues,
} from "../order-form/types";
import type { Order } from "../orders/types";
import type { Address } from "../shared/types";
export interface PrepareOrderParams {
  form: CalculatedOrderForm;
  /** ERC-20 token spent by the order; pass the wrapped token for native input. */
  inputTokenAddress: string;
  outputTokenAddress: string;
  swapperAddress: string;
}

export interface Eip712TypedData {
  domain: RePermitData["domain"];
  types: RePermitData["types"];
  primaryType: string;
  message: RePermitOrder;
}

export interface OrderSigningRequest {
  signerAddress: Address;
  typedData: Eip712TypedData;
}

export interface ApprovalRequest {
  tokenAddress: string;
  amount: string;
  spenderAddress: Address;
}

export type AllowanceRequest = Omit<ApprovalRequest, "amount">;

export interface PreparedOrderValues extends CalculatedOrderValues {
  currentTimeMillis: number;
  deadlineMillis: number;
}

export interface PreparedOrder {
  /** Protocol order produced from the calculated form and client config. */
  order: RePermitOrder;
  /** Framework-neutral signer identity and EIP-712 typed data. */
  signingRequest: OrderSigningRequest;
  /** ERC-20 approval payload for the exact signed input amount. */
  approvalRequest: ApprovalRequest;
  /** Complete calculated form snapshot shown to the user. */
  form: CalculatedOrderForm;
  /** `form.values` plus the preparation-time timestamps used by the signed order. */
  values: PreparedOrderValues;
}

export interface CancelOrderRequest {
  order: Order;
  contractAddress: string;
  args: string[] | string[][];
  abi: typeof TWAP_ABI | typeof REPERMIT_ABI;
}

export type ClientGetAccountOrdersParams = Omit<
  GetAccountOrdersParams,
  "chainId" | "partner"
>;

export interface SpotClient {
  readonly analytics: SpotAnalytics;
  readonly partner: Partners;
  readonly chainId: number;
  readonly rePermitData: RePermitData;
  readonly spenderAddress: Address;
  readonly exchangeAddress: Address;
  /** Converts a valid calculated form snapshot into signing and approval data. */
  prepareOrder(params: PrepareOrderParams): PreparedOrder;
  /** Submits an already prepared and signed order to the order service. */
  submitOrder(order: RePermitOrder, signature: `0x${string}`): Promise<Order>;
  /** Builds the contract call required to cancel an order without sending it. */
  getCancelOrderRequest(order: Order): CancelOrderRequest;
  /** Fetches account orders using this client's partner, chain, and exchange. */
  getAccountOrders(params: ClientGetAccountOrdersParams): Promise<Order[]>;
  /** Includes source status so partial results can be retried. */
  getAccountOrdersResult(
    params: ClientGetAccountOrdersParams,
  ): Promise<AccountOrdersResult>;
}

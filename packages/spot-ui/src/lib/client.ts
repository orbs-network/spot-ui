import { REPERMIT_ABI, TWAP_ABI } from "./abi";
import { analytics } from "./analytics";
import {
  buildRePermitOrderData,
  fetchRePermitData,
} from "./build-repermit-order-data";
import type {
  CalculatedOrderForm,
  CalculatedOrderValues,
} from "./order-form/types";
import { getPartners } from "./partners";
import { isNativeAddress } from "./utils";
import {
  getAccountOrders,
  type GetAccountOrdersParams,
} from "./orders";
import { submitOrder as submitOrderRequest } from "./submit-order";
import type {
  Address,
  Order,
  Partners,
  RePermitData,
  RePermitOrder,
  TimeDuration,
} from "./types";

const getDeadline = (
  currentTimeMillis: number,
  duration: TimeDuration,
): number => currentTimeMillis + duration.unit * duration.value + 60_000;

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

export type SignOrderCallback = (
  request: OrderSigningRequest,
) => Promise<`0x${string}`>;

export interface CancelOrderRequest {
  order: Order;
  contractAddress: string;
  args: string[] | string[][];
  abi: typeof TWAP_ABI | typeof REPERMIT_ABI;
}

export type ClientGetAccountOrdersParams = Omit<
  GetAccountOrdersParams,
  "chainId" | "exchange" | "partner"
>;

export interface SpotClient {
  readonly partner: Partners;
  readonly chainId: number;
  readonly rePermitData: RePermitData;
  readonly spenderAddress: Address;
  readonly exchangeAddress: Address;
  /** Converts a valid calculated form snapshot into signing and approval data. */
  prepareOrder(params: PrepareOrderParams): PreparedOrder;
  /** Requests the wallet signature without submitting the order. */
  signOrder(
    preparedOrder: PreparedOrder,
    signer: SignOrderCallback,
  ): Promise<`0x${string}`>;
  /** Submits an already prepared and signed order to the order service. */
  submitOrder(
    preparedOrder: PreparedOrder,
    signature: `0x${string}`,
  ): Promise<Order>;
  /** Builds the contract call required to cancel an order without sending it. */
  getCancelOrderRequest(order: Order): CancelOrderRequest;
  /** Fetches account orders using this client's partner, chain, and exchange. */
  getAccountOrders(params: ClientGetAccountOrdersParams): Promise<Order[]>;
}

const assertSupportedPartnerChain = (
  partner: Partners,
  chainId: number,
): void => {
  const supported = getPartners().some(
    (candidate) =>
      candidate.name === partner && candidate.chainId === chainId,
  );
  if (!supported) {
    throw new Error(`Partner "${partner}" is not supported on chain ${chainId}`);
  }
};

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const ZERO_ADDRESS_PATTERN = /^0x0{40}$/i;

function assertConfiguredAddress(
  value: unknown,
  field: string,
): asserts value is Address {
  if (
    typeof value !== "string" ||
    !ADDRESS_PATTERN.test(value) ||
    ZERO_ADDRESS_PATTERN.test(value)
  ) {
    throw new Error(
      `Invalid RePermit configuration: ${field} must be a non-zero EVM address`,
    );
  }
}

const assertRePermitConfiguration = (
  data: RePermitData,
  requestedChainId: number,
): void => {
  const config = data as Partial<RePermitData>;
  const domain = config.domain as Partial<RePermitData["domain"]> | undefined;
  const order = config.order as Partial<RePermitOrder> | undefined;
  const witness = order?.witness as Partial<RePermitOrder["witness"]> | undefined;

  if (Number(domain?.chainId) !== requestedChainId) {
    throw new Error(
      `Invalid RePermit configuration: domain.chainId does not match requested chain ${requestedChainId}`,
    );
  }
  if (Number(witness?.chainid) !== requestedChainId) {
    throw new Error(
      `Invalid RePermit configuration: order.witness.chainid does not match requested chain ${requestedChainId}`,
    );
  }

  assertConfiguredAddress(
    domain?.verifyingContract,
    "domain.verifyingContract",
  );
  assertConfiguredAddress(
    witness?.exchange?.adapter,
    "order.witness.exchange.adapter",
  );
};

/**
 * Creates a new initialized SDK client for a partner and chain. The caller owns
 * caching, request deduplication, and refresh policy.
 */
export const createClient = async (
  partner: Partners,
  chainId: number,
): Promise<SpotClient> => {
  assertSupportedPartnerChain(partner, chainId);

  // Fetch the chain-specific RePermit configuration once for this client.
  const rePermitData = await fetchRePermitData(partner, chainId);
  assertRePermitConfiguration(rePermitData, chainId);
  const spenderAddress = rePermitData.domain.verifyingContract;
  const exchangeAddress = rePermitData.order.witness.exchange.adapter;
  let latestNonce = 0;

  // Keep nonces monotonic for this client instance. A newly created client
  // starts again from the current wall-clock value.
  const createNonce = (currentTimeMillis: number): string => {
    latestNonce = Math.max(currentTimeMillis, latestNonce + 1);
    return latestNonce.toString();
  };

  /**
   * Stamps an existing calculated form with a fresh start, deadline, and nonce,
   * then creates the exact protocol order, wallet signing payload, and ERC-20
   * approval request. It performs no wallet interaction or network submission.
   */
  const prepareOrder = (params: PrepareOrderParams): PreparedOrder => {
    const { form } = params;
    if (!form.canSubmit) {
      throw new Error("Order form is not submittable");
    }
    if (isNativeAddress(params.inputTokenAddress)) {
      throw new Error(
        "prepareOrder inputTokenAddress must be an ERC-20 address; pass the host-provided wrapped native token for native input",
      );
    }
    const values = form.values;
    const currentTimeMillis = Date.now();
    const preparedValues: PreparedOrderValues = {
      ...values,
      currentTimeMillis,
      deadlineMillis: getDeadline(currentTimeMillis, values.duration),
    };
    const permitData = buildRePermitOrderData({
      inputTokenAddress: params.inputTokenAddress,
      outputTokenAddress: params.outputTokenAddress,
      totalInputAmount: values.inputAmount,
      nonce: createNonce(currentTimeMillis),
      currentTimeMillis: preparedValues.currentTimeMillis,
      deadlineMillis: preparedValues.deadlineMillis,
      fillDelayMillis: values.fillDelayMillis,
      totalTrades: values.totalTrades,
      slippageBps: values.slippageBps,
      swapperAddress: params.swapperAddress,
      inputAmountPerTrade: values.inputAmountPerTrade,
      minOutputAmountPerTrade: values.minOutputAmountPerTrade,
      triggerOutputAmountPerTrade: values.triggerOutputAmountPerTrade,
      permitData: rePermitData,
      module: form.module,
    });
    const order = permitData.order;

    return {
      order,
      signingRequest: {
        signerAddress: params.swapperAddress as Address,
        typedData: {
          domain: permitData.domain,
          types: permitData.types,
          primaryType: permitData.primaryType,
          message: order,
        },
      },
      approvalRequest: {
        tokenAddress: order.permitted.token,
        amount: values.inputAmount,
        spenderAddress,
      },
      form,
      values: preparedValues,
    };
  };

  /**
   * Passes the prepared EIP-712 payload to the host wallet adapter and returns
   * its signature. It records signing analytics but does not submit the order.
   */
  const signOrder = async (
    preparedOrder: PreparedOrder,
    signer: SignOrderCallback,
  ): Promise<`0x${string}`> => {
    analytics.onSignOrderRequest(preparedOrder.order);

    try {
      const signature = await signer(preparedOrder.signingRequest);
      analytics.onSignOrderSuccess(signature);
      return signature;
    } catch (error) {
      analytics.onSignOrderError(error);
      throw error;
    }
  };

  /**
   * Sends a prepared order and its wallet signature to the order service. The
   * order must already have been signed with signOrder or an equivalent signer.
   */
  const submitOrder = (
    preparedOrder: PreparedOrder,
    signature: `0x${string}`,
  ): Promise<Order> =>
    submitOrderRequest(preparedOrder.order, signature);

  /**
   * Builds the correct v1 or v2 cancellation contract request. It only returns
   * the contract, ABI, and arguments; the host wallet sends the transaction.
   */
  const getCancelOrderRequest = (order: Order): CancelOrderRequest => {
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

  /**
   * Fetches order history with the partner, chain, and exchange captured by
   * this client, leaving only account and pagination options to the caller.
   */
  const getConfiguredAccountOrders = (
    params: ClientGetAccountOrdersParams,
  ): Promise<Order[]> =>
    getAccountOrders({
      ...params,
      chainId,
      exchange: exchangeAddress,
      partner,
    });

  return Object.freeze({
    partner,
    chainId,
    rePermitData,
    spenderAddress,
    exchangeAddress,
    prepareOrder,
    signOrder,
    submitOrder,
    getCancelOrderRequest,
    getAccountOrders: getConfiguredAccountOrders,
  });
};

// Calculated advanced-order integration; swaps use the quote-only client flow.
import {
  calculateOrder,
  createClient,
  getQuote,
  type CalculateOrderFormParams,
  type CalculatedOrderForm,
  type CancelOrderRequest,
  type Order,
  type Address,
  type Eip712TypedData,
  type Hex,
  type PreparedOrder,
  type Partners,
  type SpotClient,
  type SwapQuote,
  type SwapQuoteParams,
  type Token,
} from "@orbs-network/spot-ui";

/** DEX-owned wallet services; transaction methods resolve after successful receipts. */
export interface SpotWalletPort {
  getAllowance(tokenAddress: string, spenderAddress: Address): Promise<bigint>;
  wrapNativeToken(amountRaw: string): Promise<Hex>;
  approveToken(tokenAddress: string, spenderAddress: Address, amountRaw: string): Promise<Hex>;
  signTypedData(params: Eip712TypedData & { account: Address }): Promise<Hex>;
  cancelOrder(request: CancelOrderRequest): Promise<Hex>;
}

export interface SpotIntegrationOptions {
  partner: Partners;
  chainId: number;
  wallet: SpotWalletPort;
}

export interface SubmitSpotOrderParams {
  form: CalculatedOrderForm;
  /** Protocol ERC-20 input; normalize a native selection to the configured wrapped token. */
  inputToken: Token;
  outputToken: Token;
  account: Address;
  /** The host selected native input; inputToken remains its wrapped ERC-20 token. */
  isNativeInput?: boolean;
  /** Create before starting wallet work; abort on account/chain changes or disposal. */
  signal?: AbortSignal;
}

export interface SubmittedSpotOrder {
  order: Order;
  wrapTxHash?: `0x${string}`;
  approvalTxHash?: `0x${string}`;
}

export interface SpotOrderAttempt {
  prepared?: PreparedOrder;
  signature?: Hex;
  order?: Order;
  wrapTxHash?: Hex;
  approvalTxHash?: Hex;
}

export class SpotIntegration {
  private clientPromise?: Promise<SpotClient>;
  private currentAttempt?: SpotOrderAttempt;
  private isSubmitting = false;
  private readonly cancellingOrderKeys = new Set<string>();

  public constructor(private readonly options: SpotIntegrationOptions) {}

  /** Drive the host's loading state and automatic/manual quote pause from this. */
  public get isExecuting(): boolean { return this.isSubmitting; }

  /** Preserve this state for reconciliation before retrying an uncertain submission. */
  public get attempt(): SpotOrderAttempt | undefined { return this.currentAttempt; }

  public getQuote(
    params: Omit<SwapQuoteParams, "chainId" | "partner">,
  ): Promise<SwapQuote> {
    if (this.isExecuting) return Promise.reject(new Error("Quotes are paused during execution"));
    // Standalone quoting keeps disconnected previews independent of /config.
    // With an initialized client, client.getQuote(params) supplies the same scope.
    return getQuote({ ...params, chainId: this.options.chainId, partner: this.options.partner });
  }

  public calculateForm(
    params: CalculateOrderFormParams,
  ): CalculatedOrderForm {
    return calculateOrder(params);
  }

  public getClient(): Promise<SpotClient> {
    const existingClient = this.clientPromise;
    if (existingClient) return existingClient;

    const nextClient = createClient(
      this.options.partner,
      this.options.chainId,
    ).catch((error: unknown) => {
      this.clientPromise = undefined;
      throw error;
    });
    this.clientPromise = nextClient;
    return nextClient;
  }

  public retryClient(): Promise<SpotClient> {
    this.clientPromise = undefined;
    return this.getClient();
  }

  /** Calculated advanced orders resolve when the order service accepts them. */
  public async submitOrder(
    params: SubmitSpotOrderParams,
  ): Promise<SubmittedSpotOrder> {
    if (this.isSubmitting) {
      throw new Error("A Spot order submission is already in progress");
    }
    if (!params.form.canSubmit) {
      throw new Error("The Spot order form is not submittable");
    }

    const reviewed = {
      ...params,
      form: structuredClone(params.form),
      inputToken: { ...params.inputToken },
      outputToken: { ...params.outputToken },
    };
    this.isSubmitting = true;
    try {
      reviewed.signal?.throwIfAborted();
      const client = await this.getClient();
      reviewed.signal?.throwIfAborted();

      const wallet = this.options.wallet;
      const amountRaw = reviewed.form.inputAmount.raw;
      const amount = BigInt(amountRaw);
      const token = reviewed.inputToken.address;
      const spender = client.spenderAddress;
      const attempt: SpotOrderAttempt = {};
      this.currentAttempt = attempt;
      const check = () => reviewed.signal?.throwIfAborted();
      let allowance = await wallet.getAllowance(token, spender);
      check();
      if (reviewed.isNativeInput) {
        attempt.wrapTxHash = await wallet.wrapNativeToken(amountRaw);
        check();
      }
      for (let index = 0; allowance < amount && index < 2; index += 1) {
        attempt.approvalTxHash = await wallet.approveToken(token, spender, amountRaw);
        check();
        allowance = await wallet.getAllowance(token, spender);
        check();
      }
      if (allowance < amount) throw new Error("Confirmed approval is still insufficient");

      attempt.prepared = client.prepareOrder({
        form: reviewed.form, account: reviewed.account,
        inputTokenAddress: token, outputTokenAddress: reviewed.outputToken.address,
      });
      const { signerAddress, typedData } = attempt.prepared.signingRequest;
      attempt.signature = await wallet.signTypedData({ ...typedData, account: signerAddress });
      check();
      attempt.order = await client.submitOrder(attempt.prepared.order, attempt.signature, { signal: reviewed.signal });
      return { order: attempt.order, wrapTxHash: attempt.wrapTxHash, approvalTxHash: attempt.approvalTxHash };
    } finally {
      this.isSubmitting = false;
    }
  }

  public async getOrders(
    account?: string,
    signal?: AbortSignal,
  ): Promise<Order[]> {
    const client = await this.getClient();
    const { orders } = await client.getOrders({ account, signal });
    return orders;
  }

  public async cancelOrder(order: Order): Promise<`0x${string}`> {
    if (this.cancellingOrderKeys.has(order.historyKey)) {
      throw new Error("This Spot order cancellation is already in progress");
    }

    this.cancellingOrderKeys.add(order.historyKey);
    try {
      const client = await this.getClient();
      return await this.options.wallet.cancelOrder(
        client.getCancelOrderRequest(order),
      );
    } finally {
      this.cancellingOrderKeys.delete(order.historyKey);
    }
  }
}

// Calculated advanced-order integration; swaps use the quote-only client flow.
import {
  calculateOrder,
  createClient,
  getQuote,
  type CalculateOrderFormParams,
  type CalculatedOrderForm,
  type CancelOrderRequest,
  type Order,
  type OrderExecution,
  type OrderWalletInteractions,
  type Partners,
  type SpotClient,
  type SwapQuote,
  type SwapQuoteParams,
  type Token,
} from "@orbs-network/spot-ui";

/** Compare allowance with request.amount; the approval write may use the suggested approvalAmount or host policy. */
export interface SpotWalletPort extends OrderWalletInteractions {
  cancelOrder(request: CancelOrderRequest): Promise<`0x${string}`>;
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
  account: string;
  /** Create before starting wallet work; abort on account/chain changes or disposal. */
  signal?: AbortSignal;
}

export interface SubmittedSpotOrder {
  order: Order;
  wrapTxHash?: `0x${string}`;
  approvalTxHash?: `0x${string}`;
}

export class SpotIntegration {
  private clientPromise?: Promise<SpotClient>;
  private currentExecution?: OrderExecution;
  private isSubmitting = false;
  private readonly cancellingOrderKeys = new Set<string>();

  public constructor(private readonly options: SpotIntegrationOptions) {}

  /** Drive the host's loading state and automatic/manual quote pause from this. */
  public get isExecuting(): boolean { return this.isSubmitting; }

  /** Retain accepted/prepared state for host progress and reconciliation after a failed run. */
  public get execution(): OrderExecution | undefined { return this.currentExecution; }

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

    this.isSubmitting = true;
    try {
      params.signal?.throwIfAborted();
      const client = await this.getClient();
      params.signal?.throwIfAborted();

      const walletParams = {
        account: params.account,
        walletInteractions: this.options.wallet, signal: params.signal,
      };
      const execution = client.createOrderExecution({
        ...walletParams, form: params.form,
        inputTokenAddress: params.inputToken.address,
        outputTokenAddress: params.outputToken.address,
      });
      this.currentExecution = execution;
      const order = await execution.run();
      return {
        order,
        wrapTxHash: execution.wrapTxHash as `0x${string}` | undefined,
        approvalTxHash: execution.approvalTxHash as `0x${string}` | undefined,
      };
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

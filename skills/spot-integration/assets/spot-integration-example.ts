import {
  calculateOrderForm,
  createClient,
  isNativeAddress,
  isTxRejected,
  type AllowanceRequest,
  type ApprovalRequest,
  type CalculateOrderFormParams,
  type CalculatedOrderForm,
  type CancelOrderRequest,
  type Order,
  type OrderSigningRequest,
  type Partners,
  type SpotClient,
  type Token,
} from "@orbs-network/spot-ui";

export interface SpotWalletPort {
  getAllowance(request: AllowanceRequest): Promise<string>;
  wrapNativeToken(amountRaw: string): Promise<`0x${string}`>;
  approveToken(request: ApprovalRequest): Promise<`0x${string}`>;
  signOrder(request: OrderSigningRequest): Promise<`0x${string}`>;
  cancelOrder(request: CancelOrderRequest): Promise<`0x${string}`>;
}

export interface SpotIntegrationOptions {
  partner: Partners;
  chainId: number;
  wrappedNativeToken?: Token;
  wallet: SpotWalletPort;
}

export interface SubmitSpotOrderParams {
  form: CalculatedOrderForm;
  inputToken: Token;
  outputToken: Token;
  account: string;
}

export interface SubmittedSpotOrder {
  order: Order;
  approvalTxHash?: `0x${string}`;
  wrapTxHash?: `0x${string}`;
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const hasRequiredAllowance = async (
  wallet: SpotWalletPort,
  request: AllowanceRequest,
  requiredAmountRaw: string,
): Promise<boolean> => {
  const allowance = await wallet.getAllowance(request);
  return BigInt(allowance) >= BigInt(requiredAmountRaw);
};

export class SpotIntegration {
  private clientPromise?: Promise<SpotClient>;
  private isSubmitting = false;
  private readonly cancellingOrderKeys = new Set<string>();

  public constructor(private readonly options: SpotIntegrationOptions) {}

  public calculateForm(
    params: CalculateOrderFormParams,
  ): CalculatedOrderForm {
    return calculateOrderForm(params);
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
      const client = await this.getClient();
      const isNativeInput = isNativeAddress(params.inputToken.address);
      const orderInputToken = isNativeInput
        ? this.options.wrappedNativeToken
        : params.inputToken;
      if (!orderInputToken) {
        throw new Error(
          "The host must provide the connected chain's wrapped-native token",
        );
      }

      const requiredAmountRaw = params.form.inputAmount.raw;
      const allowanceRequest: AllowanceRequest = {
        tokenAddress: orderInputToken.address,
        spenderAddress: client.spenderAddress,
      };
      const approvalRequired = !(await hasRequiredAllowance(
        this.options.wallet,
        allowanceRequest,
        requiredAmountRaw,
      ));

      const wrapTxHash = isNativeInput
        ? await this.options.wallet.wrapNativeToken(requiredAmountRaw)
        : undefined;

      const approvalTxHash = approvalRequired
        ? await this.options.wallet.approveToken({
            ...allowanceRequest,
            amount: requiredAmountRaw,
          })
        : undefined;

      if (approvalRequired) {
        let allowanceObserved = false;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          allowanceObserved = await hasRequiredAllowance(
            this.options.wallet,
            allowanceRequest,
            requiredAmountRaw,
          );
          if (allowanceObserved) break;
          await wait(3_000);
        }
        if (!allowanceObserved) {
          throw new Error("The confirmed token approval was not observed by RPC");
        }
      }

      // Prepare late so the signed start, deadline, and nonce stay fresh.
      const preparedOrder = client.prepareOrder({
        form: params.form,
        inputTokenAddress: orderInputToken.address,
        outputTokenAddress: params.outputToken.address,
        swapperAddress: params.account,
      });

      const signature = await client.signOrder(
        preparedOrder,
        (request) => this.options.wallet.signOrder(request),
      );
      const order = await client.submitOrder(preparedOrder, signature);

      return { order, approvalTxHash, wrapTxHash };
    } catch (error: unknown) {
      if (isTxRejected(error)) {
        throw new Error("The wallet request was rejected");
      }
      throw error;
    } finally {
      this.isSubmitting = false;
    }
  }

  public async getOrders(
    account: string,
    signal?: AbortSignal,
  ): Promise<Order[]> {
    const client = await this.getClient();
    return client.getAccountOrders({ account, signal, page: 0, limit: 25 });
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

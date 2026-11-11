import {
  bindOrderAnalytics,
  bindSubmittedOrderAnalytics,
  createAnalyticsOperation,
  createClientAnalytics,
  getOrderAnalytics,
  getSubmittedOrderAnalytics,
  resolveAnalyticsReporter,
  type SpotAnalytics,
} from "./analytics";
import { REPERMIT_ABI, TWAP_ABI } from "./abi";
import { buildRePermitOrderData } from "./build-repermit-order-data";
import { MAX_UINT_256 } from "./evm-constants";
import { fetchRePermitData } from "./fetch-repermit-data";
import type {
  CalculatedOrderForm,
  CalculatedOrderValues,
} from "./order-form/types";
import { assertOrderExecutionValues } from "./order-form/validation";
import { isNativeAddress } from "./utils";
import {
  getClientOrders as fetchClientOrders,
  type AccountOrdersResult,
  type GetClientOrdersParams,
} from "./orders";
import { submitOrder as submitOrderRequest } from "./submit-order";
import { getOrder } from "./orders/v2-orders";
import { OrderType } from "./types";
import { SpotError } from "./errors";
import { getApiEndpoint } from "./api-config";
import { fetchQuote, getQuoteAnalyticsContext, isQuoteFresh, type SwapQuote, type SwapQuoteParams } from "./quote";
import { observe } from "./observe";
import { MIN_FILL_DELAY_MILLIS, SWAP_ORDER_DURATION_MILLIS, SWAP_ORDER_SLIPPAGE_BPS } from "./order-form/constants";
import type { CreateSwapExecutionParams, PreparedSwap } from "./swap";
import type { OrderExecution, SwapExecution } from "./execution-session";
import type { OrderWalletInteractions, OrderExecutionUpdate, SignableOrder } from "./execute-order";
import { createOrderExecutionSession } from "./internal/execute-order";
import { getClientCreationAnalytics, registerClientInternals } from "./internal/client";
import { waitForOrder } from "./internal/wait-for-order";
import { captureValidatedSwap, type ReviewedSwapInput } from "./swap-validation";
import type {
  Address,
  DeepReadonly,
  Order,
  Partners,
  RePermitData,
  RePermitOrder,
  TimeDuration,
} from "./types";

const SWAP_QUOTE_MAX_AGE_MILLIS = 20_000;

const retainProgressSnapshot = <T extends SignableOrder>(
  original: OrderExecutionUpdate<T>, snapshot: OrderExecutionUpdate<T>,
): void => {
  if (!original.order || !snapshot.order) return;
  const reporter = getSubmittedOrderAnalytics(original.order);
  if (reporter) bindSubmittedOrderAnalytics(snapshot.order, reporter);
};

const getDeadline = (
  currentTimeMillis: number,
  duration: TimeDuration,
): number => currentTimeMillis + duration.unit * duration.value + 60_000;

const assertAdvancedOrderType = (orderType: unknown): void => {
  if (!Object.values(OrderType).includes(orderType as OrderType)) {
    throw new SpotError("INVALID_ARGUMENT", "Advanced orders require an OrderType; use createSwapExecution for quote-based swaps");
  }
};

interface PrepareOrderParams {
  /** Reviewed result of `calculateOrder`; `form.canSubmit` must be true. */
  form: CalculatedOrderForm;
  /** ERC-20 token spent by the order; pass the wrapped token for native input. */
  inputTokenAddress: string;
  /** Output-token address for the reviewed pair. */
  outputTokenAddress: string;
  /** Account that owns the input tokens and will sign the order. */
  swapperAddress: string;
}

/** EIP-712 payload to pass to the host wallet's typed-data signing method. */
export interface Eip712TypedData {
  domain: RePermitData["domain"];
  types: RePermitData["types"];
  primaryType: string;
  message: RePermitOrder;
}

export interface OrderSigningRequest {
  /** Account that must sign `typedData`. */
  signerAddress: Address;
  /** Sign this payload unchanged, then submit the original signature. */
  typedData: Eip712TypedData;
}

/** Exact ERC-20 spending requirement and the suggested wallet approval cap. */
export interface ApprovalRequest {
  /** ERC-20 input token; native input must be wrapped first. */
  tokenAddress: string;
  /** Required allowance in integer token base units, not a display amount. */
  amount: string;
  /** Suggested transaction approval cap in integer base units. Defaults to MAX_UINT_256; hosts may approve `amount` instead. */
  approvalAmount: string;
  /** RePermit contract to approve, also available as `client.spenderAddress`. */
  spenderAddress: Address;
}

/** Token and spender to use when reading the connected account's allowance. */
export type AllowanceRequest = Omit<ApprovalRequest, "amount" | "approvalAmount">;

export interface PreparedOrderValues extends CalculatedOrderValues {
  /** Local preparation time as Unix milliseconds. */
  currentTimeMillis: number;
  /** Preparation-time expiration as Unix milliseconds, before protocol rounding to seconds. */
  deadlineMillis: number;
}

export interface PreparedOrder {
  /** Protocol order produced from the calculated form and client config. */
  order: RePermitOrder;
  /** Framework-neutral signer identity and EIP-712 typed data. */
  signingRequest: OrderSigningRequest;
  /** Exact signed input requirement and suggested ERC-20 approval cap. */
  approvalRequest: ApprovalRequest;
  /** Complete calculated form snapshot shown to the user. */
  form: CalculatedOrderForm;
  /** `form.values` plus the preparation-time timestamps used by the signed order. */
  values: PreparedOrderValues;
}

/** Reviewed form and wallet operations for one advanced-order execution. */
export interface CreateOrderExecutionParams {
  /** Submittable calculated form captured before wallet work begins. */
  form: CalculatedOrderForm;
  /** Connected signer and output recipient. */
  account: string;
  /** ERC-20 input address; use the wrapped token address when shouldWrap() requests native wrapping. */
  inputTokenAddress: string;
  /** Output token for the reviewed form. */
  outputTokenAddress: string;
  /** Host prerequisite checks and wallet operations that resolve after successful transaction receipts. */
  walletInteractions: OrderWalletInteractions;
  /** Stop later steps; completed transactions and accepted orders remain valid. */
  signal?: AbortSignal;
}

/** Arguments for the host wallet to call `cancel` on `contractAddress`. */
export interface CancelOrderRequest {
  /** Normalized order being cancelled. */
  order: Order;
  /** V1 TWAP contract or V2 RePermit contract on the client's chain. */
  contractAddress: string;
  /** Version-specific arguments for the contract's `cancel` function. */
  args: string[] | string[][];
  /** ABI matching the selected cancellation contract. */
  abi: typeof TWAP_ABI | typeof REPERMIT_ABI;
}

/** Order-history filters; chain and partner come from the client. */
export type ClientGetOrdersParams = Omit<
  GetClientOrdersParams,
  "chainId" | "partner" | "apiUrl"
>;

export interface ClientGetOrderParams {
  /** Full v2 order.id returned by submission, not a legacy numeric ID or historyKey. */
  orderId: string;
  /** Cancels this lookup. The caller owns retry and polling policy. */
  signal?: AbortSignal;
}

export interface CreateClientOptions {
  /** Disable all analytics events for this client. Defaults to false. */
  disableAnalytics?: boolean;
  /** Trusted order-service base URL, fixed for this client's lifetime. Defaults to production v2. */
  apiUrl?: string;
}

/** Submission and swap-settlement options; cancellation cannot cancel an accepted order. */
export interface SubmitOrderOptions {
  signal?: AbortSignal;
}

/** Quote inputs; the selected chain and partner are supplied by the client. */
export type ClientGetQuoteParams = Omit<SwapQuoteParams, "chainId" | "partner" | "apiUrl">;

interface PrepareSwapParams {
  /** Reviewed quote, reused while fresh; stale quotes refresh the unchanged request. */
  quote: SwapQuote;
  /** Connected signer and recipient, independent of the quote's preview user. */
  account: string;
  /** Cancels the refresh before a signing payload is prepared. */
  signal?: AbortSignal;
}

/** Reusable protocol configuration and order operations for one partner and chain. */
export interface SpotClient {
  /** Partner selected when this client was created. */
  readonly partner: Partners;
  /** EVM chain used for configuration, signing, submission, and account history. */
  readonly chainId: number;
  /** Captured order-service base URL used for submission, status, history, and recovery. */
  readonly apiUrl: string;
  /** Validated protocol template and EIP-712 domain loaded during initialization. */
  readonly rePermitData: RePermitData;
  /** RePermit contract to use as the ERC-20 approval spender. */
  readonly spenderAddress: Address;
  /** Current partner adapter loaded from the protocol configuration. */
  readonly exchangeAddress: Address;

  /**
   * Gets the estimated output and protected minimum for an exact-input swap.
   * Uses this client's chain and partner; no wallet interaction is required.
   * Equivalent to standalone `getQuote` with those fields already supplied.
   * Amounts are integer token base units; slippage is a percentage (`0.5` means 0.5%).
   *
   * @param params - Token pair, raw input amount, quote user or preview address, slippage, and optional abort signal.
   * @returns Quote amounts, frozen request identity, and local receipt time.
   * @throws `QuoteError` on quote failures; request abort errors propagate unchanged.
   *
   * @example
   * const quote = await client.getQuote({
   *   inToken, outToken, inAmount: "1000000", user: account, slippage: 0.5,
   * });
   */
  getQuote(params: ClientGetQuoteParams): Promise<SwapQuote>;

  /** Create a quote-based swap; creation performs no wallet operations. run() waits for completion. */
  createSwapExecution(params: CreateSwapExecutionParams): SwapExecution;
  /** Create an advanced order. run() resolves at acceptance; waitForCompletion() tracks its fills. */
  createOrderExecution(params: CreateOrderExecutionParams): OrderExecution;

  /**
   * Creates the contract call needed to cancel an order through the host wallet.
   * The host wallet calls `cancel` with the returned contract, ABI, and arguments
   * on this client's chain, waits for confirmation, then refreshes the order.
   *
   * @param order - Normalized V1 or V2 order from submission or history on this client's chain.
   * @returns Cancellation request; no transaction is sent by this method.
   * @throws If the cancellation contract address is unavailable.
   */
  getCancelOrderRequest(order: DeepReadonly<Order>): CancelOrderRequest;

  /**
   * Looks up the latest status of one V2 order by its full signed order ID.
   * Uses this client's chain and endpoint.
   * Makes one request without polling. Use `OrderStatus.Completed` to check for a fill.
   *
   * @param params - Full `order.id` from submission and an optional request abort signal.
   * @returns Matching normalized order, or `undefined` if missing or not indexed yet.
   * @throws If the request fails, its response is invalid, or the signal is aborted.
   *
   * @example
   * const current = await client.getOrder({ orderId: order.id });
   */
  getOrder(params: ClientGetOrderParams): Promise<Order | undefined>;

  /**
   * Lists order history for this client's partner and chain, newest first.
   * Omit `account` to include orders from all wallets.
   * Includes current and older order-sink services and legacy TWAP history by default.
   * `page` and `limit` apply only to the legacy TWAP source.
   *
   * @param params - Optional account, legacy-source switches, pagination, and abort signal.
   * @returns `{ orders, legacyLoaded }`, with newest-first orders and partial results
   * when a source fails. `legacyLoaded` is true only when a configured and requested
   * legacy TWAP source succeeded; false also means disabled, unavailable, or failed.
   * @throws If pagination is invalid, no requested source succeeds, or the signal is aborted.
   *
   * @example
   * const { orders, legacyLoaded } = await client.getOrders({ account });
   * const allAccounts = await client.getOrders();
   */
  getOrders(params?: ClientGetOrdersParams): Promise<AccountOrdersResult>;
}

// Clients in this SDK instance share the allocator, including quote-only clients.
let latestNonce = 0;
const createNonce = (currentTimeMillis: number): string => {
  latestNonce = Math.max(currentTimeMillis, latestNonce + 1);
  return latestNonce.toString();
};

/** Both preparation paths retain the exact signed input and suggest the default approval cap. */
const createOrderRequests = (
  permitData: RePermitData,
  signerAddress: string,
  inputAmount: string,
  spenderAddress: Address,
): Pick<PreparedOrder, "signingRequest" | "approvalRequest"> => ({
  signingRequest: {
    signerAddress: signerAddress as Address,
    typedData: {
      domain: permitData.domain,
      types: permitData.types,
      primaryType: permitData.primaryType,
      message: permitData.order,
    },
  },
  approvalRequest: {
    tokenAddress: permitData.order.permitted.token,
    amount: inputAmount,
    approvalAmount: MAX_UINT_256,
    spenderAddress,
  },
});

/**
 * Creates a client for swap quotes, wallet execution, and order management.
 * Loads and validates protocol configuration for one partner and EVM chain.
 * Reuse the client for that pair; create or retrieve another when either changes.
 * The host owns client caching and wallet connections. Analytics initializes after
 * configuration validation unless disabled through `options`.
 *
 * @param partner - DEX integration to load configuration for, such as `Partners.Quick`.
 * @param chainId - Positive EVM chain ID, such as `137` for Polygon.
 * @param options - Optional analytics settings and trusted order-service base URL.
 * @returns Initialized client for preparing, submitting, looking up, and cancelling orders.
 * @throws If the chain ID is invalid, configuration loading fails, or configuration is invalid.
 *
 * @example
 * const client = await createClient(Partners.Quick, 137);
 * // Use client.spenderAddress for ERC-20 approvals on this chain.
 */
export const createClient = async (
  partner: Partners,
  chainId: number,
  options: CreateClientOptions = {},
): Promise<SpotClient> => {
  const analytics = createClientAnalytics(getClientCreationAnalytics(options), options.disableAnalytics);
  const configurationAnalytics = createAnalyticsOperation(analytics, { partner, chainId });
  let apiUrl: string;
  let rePermitData: RePermitData;
  try {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new SpotError("INVALID_ARGUMENT", "chainId must be a positive safe integer");
    }

    // Configuration requests/templates are shared; callers receive isolated copies.
    apiUrl = getApiEndpoint(options.apiUrl);
    rePermitData = await fetchRePermitData(partner, chainId, apiUrl);
  } catch (error) {
    observe(() => configurationAnalytics.onConfigurationError(error));
    throw error;
  }
  observe(() => analytics.init(partner, rePermitData));
  const spenderAddress = rePermitData.domain.verifyingContract;
  const exchangeAddress = rePermitData.order.witness.exchange.adapter;

  /** Get swap output estimates and the protected minimum using this client's chain and partner. */
  const getQuote = (params: ClientGetQuoteParams): Promise<SwapQuote> =>
    fetchQuote(
      { ...params, chainId, partner, apiUrl },
      createAnalyticsOperation(analytics, getQuoteAnalyticsContext({ ...params, chainId, partner })),
    );

  /**
   * Stamps an existing calculated form with a fresh start, deadline, and nonce,
   * then creates the exact protocol order, wallet signing payload, and ERC-20
   * approval request. It performs no wallet interaction or network submission.
   */
  const prepareOrder = (params: PrepareOrderParams): PreparedOrder => {
    const { form } = params;
    assertAdvancedOrderType(form?.orderType);
    if (!form.canSubmit) {
      throw new SpotError("FORM_NOT_SUBMITTABLE", "Order form is not submittable");
    }
    if (isNativeAddress(params.inputTokenAddress)) {
      throw new SpotError("INVALID_ARGUMENT",
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
      kind: form.orderType,
    });
    const order = permitData.order;
    // Pure preparation only binds context; telemetry starts when execution/submission starts.
    bindOrderAnalytics(order, createAnalyticsOperation(analytics, {
      account: params.swapperAddress,
      chainId,
      partner,
      orderType: form.orderType,
      inputTokenAddress: params.inputTokenAddress,
      outputTokenAddress: params.outputTokenAddress,
      inputAmountRaw: values.inputAmount,
      minimumOutputAmountRaw: values.minOutputAmountPerTrade,
      inputAmountPerTradeRaw: values.inputAmountPerTrade,
      triggerOutputAmountPerTradeRaw: values.triggerOutputAmountPerTrade,
      deadlineMillis: Number(order.deadline) * 1000,
      fillDelayMillis: values.fillDelayMillis,
      slippagePercent: values.slippageBps / 100,
      totalTrades: values.totalTrades,
      isMarketOrder: values.isMarketOrder,
    }));

    return {
      order,
      ...createOrderRequests(permitData, params.swapperAddress, values.inputAmount, spenderAddress),
      form,
      values: preparedValues,
    };
  };

  // Public entry points validate first; this builder only consumes captured inputs.
  const buildPreparedSwap = (
    { quote: preparedQuote, userAddress }: ReviewedSwapInput,
    reporter: SpotAnalytics,
  ): PreparedSwap => {
    const currentTimeMillis = Date.now();
    const minimumOutputAmountRaw = preparedQuote.minimumAmountOut;
    const orderDeadlineMillis = currentTimeMillis + SWAP_ORDER_DURATION_MILLIS;
    const permit = buildRePermitOrderData({
      inputTokenAddress: preparedQuote.request.inToken,
      outputTokenAddress: preparedQuote.request.outToken,
      totalInputAmount: preparedQuote.request.inAmount,
      inputAmountPerTrade: preparedQuote.request.inAmount,
      minOutputAmountPerTrade: minimumOutputAmountRaw,
      nonce: createNonce(currentTimeMillis),
      currentTimeMillis,
      deadlineMillis: orderDeadlineMillis,
      fillDelayMillis: MIN_FILL_DELAY_MILLIS,
      totalTrades: 1,
      slippageBps: SWAP_ORDER_SLIPPAGE_BPS,
      swapperAddress: userAddress,
      permitData: rePermitData,
      kind: "SWAP",
    });
    bindOrderAnalytics(permit.order, reporter);
    return {
      order: permit.order,
      quote: preparedQuote,
      ...createOrderRequests(permit, userAddress, preparedQuote.request.inAmount, spenderAddress),
      values: {
        inputAmount: preparedQuote.request.inAmount,
        minimumOutputAmountRaw,
        currentTimeMillis,
        deadlineMillis: orderDeadlineMillis,
      },
    };
  };

  /** Finalize the quote after wallet prerequisites, then prepare the exact swap to sign. */
  const prepareSwap = async ({
    quote,
    account,
    signal,
  }: PrepareSwapParams, operationAnalytics?: SpotAnalytics): Promise<PreparedSwap> => {
    const reporter = resolveAnalyticsReporter(analytics, operationAnalytics, {
      account,
      chainId,
      partner,
      orderType: "SWAP",
    });
    let comparison: {
      reviewedMinimumOutputAmountRaw: string;
      freshMinimumOutputAmountRaw: string;
    } | undefined;
    try {
      signal?.throwIfAborted();
      const input = captureValidatedSwap(quote, account, chainId, partner);
      const reviewedQuote = input.quote;
      // Wallet prerequisites may have aged the quote since execution was created.
      if (isQuoteFresh(reviewedQuote, SWAP_QUOTE_MAX_AGE_MILLIS)) {
        observe(() => reporter.onQuoteSuccess({
          reused: true,
          context: getQuoteAnalyticsContext(reviewedQuote.request),
        }));
        return buildPreparedSwap(input, reporter);
      }
      const freshQuote = await fetchQuote({ ...reviewedQuote.request, signal, apiUrl }, reporter);
      signal?.throwIfAborted();
      const finalized = captureValidatedSwap(freshQuote, account, chainId, partner);
      const reviewedRequest = reviewedQuote.request;
      const finalRequest = finalized.quote.request;
      if (
        finalRequest.chainId !== reviewedRequest.chainId || finalRequest.partner !== reviewedRequest.partner ||
        finalRequest.inToken.toLowerCase() !== reviewedRequest.inToken.toLowerCase() ||
        finalRequest.outToken.toLowerCase() !== reviewedRequest.outToken.toLowerCase() ||
        finalRequest.inAmount !== reviewedRequest.inAmount || finalRequest.slippage !== reviewedRequest.slippage ||
        typeof finalRequest.user !== "string" || typeof reviewedRequest.user !== "string" ||
        finalRequest.user.toLowerCase() !== reviewedRequest.user.toLowerCase() ||
        (finalRequest.dexMinAmountOut ?? "-1") !== (reviewedRequest.dexMinAmountOut ?? "-1")
      ) {
        throw new SpotError("QUOTE_CONTEXT_MISMATCH", "Final swap quote does not match the reviewed request");
      }

      if (BigInt(finalized.quote.minimumAmountOut) < BigInt(reviewedQuote.minimumAmountOut)) {
        comparison = {
          reviewedMinimumOutputAmountRaw: reviewedQuote.minimumAmountOut,
          freshMinimumOutputAmountRaw: finalized.quote.minimumAmountOut,
        };
        throw new SpotError(
          "QUOTE_MINIMUM_DECREASED",
          "Swap minimum output decreased. Review a fresh quote before signing.",
        );
      }

      return buildPreparedSwap(finalized, reporter);
    } catch (error) {
      observe(() => reporter.onQuoteValidationError(error, comparison));
      throw error;
    }
  };

  /**
   * Sends a prepared order and its wallet signature to the order service. The
   * order must already have been signed by the host wallet.
   */
  const postSignedOrder = async (
    order: RePermitOrder,
    signature: `0x${string}`,
    options?: SubmitOrderOptions,
  ): Promise<Order> => {
    for (const token of [order.permitted?.token, order.witness?.input?.token]) {
      if (typeof token !== "string" || !/^0x[0-9a-f]{40}$/i.test(token) || isNativeAddress(token)) {
        throw new SpotError("INVALID_ARGUMENT", "Signed order input must be an ERC-20 token; the host must wrap native input before signing");
      }
    }
    const reporter = resolveAnalyticsReporter(analytics, getOrderAnalytics(order));
    observe(() => reporter.onOrderPrepared(order));
    bindOrderAnalytics(order, reporter);
    const accepted = await submitOrderRequest(order, signature, reporter, options, apiUrl);
    return accepted;
  };

  const reportInvalidExecution = (
    reporter: SpotAnalytics, error: unknown,
  ): never => {
    observe(() => reporter.onExecutionRequest());
    observe(() => reporter.onExecutionError(error, "preparing"));
    throw error;
  };

  const assertExecutionAddresses = (account: string, inputTokenAddress: string, outputTokenAddress: string): void => {
    for (const address of [account, inputTokenAddress, outputTokenAddress]) {
      if (typeof address !== "string" || !/^0x[0-9a-f]{40}$/i.test(address)) {
        throw new SpotError("INVALID_ARGUMENT", "Invalid execution token or signer address");
      }
    }
    if (isNativeAddress(account) || isNativeAddress(inputTokenAddress)) {
      throw new SpotError("INVALID_ARGUMENT", "Use a wrapped ERC-20 input token and a nonzero signing account");
    }
  };

  const createOrderExecution = (
    params: CreateOrderExecutionParams,
  ): OrderExecution => {
    const reporter = createAnalyticsOperation(analytics, {
      account: params.account, chainId, partner, orderType: params.form?.orderType,
      inputTokenAddress: params.inputTokenAddress, outputTokenAddress: params.outputTokenAddress,
      inputAmountRaw: params.form?.inputAmount?.raw,
    });
    let form: CalculatedOrderForm;
    try {
      assertAdvancedOrderType(params.form?.orderType);
      if (!params.form.canSubmit) throw new SpotError("FORM_NOT_SUBMITTABLE", "Order form is not submittable");
      form = structuredClone(params.form);
      assertExecutionAddresses(params.account, params.inputTokenAddress, params.outputTokenAddress);
      if (form.values.inputAmount !== form.inputAmount.raw) {
        throw new SpotError("PREPARED_ORDER_MISMATCH", "Form values do not match the reviewed input amount");
      }
      assertOrderExecutionValues(form.orderType, form.values);
    } catch (error) { return reportInvalidExecution(reporter, error); }
    const { account, inputTokenAddress, outputTokenAddress, walletInteractions, signal } = params;
    return createOrderExecutionSession({
      account, inputTokenAddress, inputAmountRaw: form.inputAmount.raw, walletInteractions, signal,
      prepareOrder: () => prepareOrder({ form, inputTokenAddress, outputTokenAddress, swapperAddress: account }),
    }, {
      client, analytics: reporter, onProgressSnapshot: retainProgressSnapshot,
      waitForCompletionOnRun: false,
      submitOrder: postSignedOrder,
      settleOrder: (order, progress, signal) => waitForOrder({ order, signal, onProgress: progress, apiUrl, analytics: reporter }),
    });
  };

  const createSwapExecution = (
    params: CreateSwapExecutionParams,
  ): SwapExecution => {
    const reporter = createAnalyticsOperation(analytics, {
      account: params.account, chainId, partner, orderType: "SWAP",
      inputTokenAddress: params.quote?.request?.inToken, outputTokenAddress: params.quote?.request?.outToken,
      inputAmountRaw: params.quote?.request?.inAmount,
    });
    let reviewed: ReviewedSwapInput;
    try { reviewed = captureValidatedSwap(params.quote, params.account, chainId, partner); }
    catch (error) { return reportInvalidExecution(reporter, error); }
    const { account, walletInteractions, signal } = params;
    return createOrderExecutionSession({
      account, inputTokenAddress: reviewed.quote.request.inToken,
      inputAmountRaw: reviewed.quote.request.inAmount, walletInteractions, signal,
      prepareOrder: sessionSignal => prepareSwap({ quote: reviewed.quote, account, signal: sessionSignal }, reporter),
    }, {
      client, analytics: reporter, onProgressSnapshot: retainProgressSnapshot,
      waitForCompletionOnRun: true,
      submitOrder: postSignedOrder,
      settleOrder: (order, progress, signal) => waitForOrder({ order, signal, onProgress: progress, apiUrl, analytics: reporter }),
    });
  };

  /**
   * Builds the correct v1 or v2 cancellation contract request. It only returns
   * the contract, ABI, and arguments; the host wallet sends the transaction.
   */
  const getCancelOrderRequest = (order: DeepReadonly<Order>): CancelOrderRequest => {
    const contractAddress =
      order.version === 1 ? order.twapAddress : spenderAddress;
    if (!contractAddress) {
      throw new SpotError("CANCELLATION_UNAVAILABLE", "Cancellation contract address is unavailable");
    }

    return {
      order: structuredClone(order) as Order,
      contractAddress,
      args: order.version === 1 ? [order.id] : [[order.repermitDigest]],
      abi: order.version === 1 ? TWAP_ABI : REPERMIT_ABI,
    };
  };

  /**
   * Fetches order history with the partner and chain captured by
   * this client, leaving only account and pagination options to the caller.
   */
  const getOrders = (
    params: ClientGetOrdersParams = {},
  ): Promise<AccountOrdersResult> =>
    fetchClientOrders({
      ...params,
      chainId,
      partner,
      apiUrl,
    }).then(result => {
      result.orders.forEach(bindTrackingAnalytics);
      return result;
    });

  // A later clientless watch retains this client's opt-out policy without emitting history events.
  const bindTrackingAnalytics = (order: Order): void => {
    bindSubmittedOrderAnalytics(order, createAnalyticsOperation(analytics, {
      account: order.maker,
      chainId,
      partner,
      orderId: order.id,
      inputTokenAddress: order.srcTokenAddress,
      outputTokenAddress: order.dstTokenAddress,
      inputAmountRaw: order.srcAmount,
      minimumOutputAmountRaw: order.dstMinAmountPerTrade,
      inputAmountPerTradeRaw: order.srcAmountPerTrade,
      triggerOutputAmountPerTradeRaw: order.triggerPricePerTrade,
      deadlineMillis: order.deadline,
      fillDelayMillis: order.fillDelay,
      totalTrades: order.totalTradesAmount,
      isMarketOrder: order.isMarketPrice,
    }));
  };

  const client: SpotClient = Object.freeze({
    partner,
    chainId,
    apiUrl,
    rePermitData,
    spenderAddress,
    exchangeAddress,
    getQuote,
    createOrderExecution,
    createSwapExecution,
    getCancelOrderRequest,
    /** Read one V2 order once; executions own completion tracking. */
    getOrder: async (params: ClientGetOrderParams): Promise<Order | undefined> => {
      const order = await getOrder({ ...params, chainId, apiUrl });
      if (order) bindTrackingAnalytics(order);
      return order;
    },
    getOrders,
  });
  registerClientInternals(client, {
    analytics,
  });
  return client;
};

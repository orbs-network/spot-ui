import {
  bindOrderAnalytics,
  bindSubmittedOrderAnalytics,
  createAnalyticsOperation,
  createClientAnalytics,
  getOrderAnalytics,
  resolveAnalyticsReporter,
  type SpotAnalytics,
} from "./analytics";
import { REPERMIT_ABI, TWAP_ABI } from "./abi";
import { buildRePermitOrderData } from "./build-repermit-order-data";
import { fetchRePermitData } from "./fetch-repermit-data";
import type {
  CalculatedOrderForm,
  CalculatedOrderValues,
} from "./order-form/types";
import { isNativeAddress } from "./utils";
import {
  getAccountOrdersResult,
  type AccountOrdersResult,
  type GetAccountOrdersParams,
} from "./orders";
import { submitOrder as submitOrderRequest } from "./submit-order";
import { getOrder } from "./orders/v2-orders";
import { Module } from "./types";
import { SpotError } from "./errors";
import { getApiEndpoint } from "./api-config";
import { fetchQuote, getQuoteAnalyticsContext, isQuoteFresh, type SwapQuote, type SwapQuoteParams } from "./quote";
import { observe } from "./observe";
import { MIN_FILL_DELAY_MILLIS, SWAP_ORDER_DURATION_MILLIS, SWAP_ORDER_SLIPPAGE_BPS } from "./order-form/constants";
import type { PrepareSwapParams, PreparedSwap } from "./swap";
import { captureValidatedSwap } from "./swap-validation";
import type {
  Address,
  Order,
  Partners,
  RePermitData,
  RePermitOrder,
  TimeDuration,
} from "./types";

const DEFAULT_QUOTE_MAX_AGE_MILLIS = 20_000;

const getDeadline = (
  currentTimeMillis: number,
  duration: TimeDuration,
  module: Module,
): number => currentTimeMillis + duration.unit * duration.value +
  (module === Module.SWAP ? 0 : 60_000);

export interface PrepareOrderParams {
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

/** ERC-20 allowance required before signing and submitting an order. */
export interface ApprovalRequest {
  /** ERC-20 input token; native input must be wrapped first. */
  tokenAddress: string;
  /** Required allowance in integer token base units, not a display amount. */
  amount: string;
  /** RePermit contract to approve, also available as `client.spenderAddress`. */
  spenderAddress: Address;
}

/** Token and spender to use when reading the connected account's allowance. */
export type AllowanceRequest = Omit<ApprovalRequest, "amount">;

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
  /** ERC-20 approval payload for the exact signed input amount. */
  approvalRequest: ApprovalRequest;
  /** Complete calculated form snapshot shown to the user. */
  form: CalculatedOrderForm;
  /** `form.values` plus the preparation-time timestamps used by the signed order. */
  values: PreparedOrderValues;
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

/** Account-history filters; chain, partner, and current adapter come from the client. */
export type ClientGetAccountOrdersParams = Omit<
  GetAccountOrdersParams,
  "chainId" | "partner" | "exchangeAddress" | "apiUrl"
>;

export interface ClientGetOrderParams {
  /** Full v2 order.id returned by submitOrder, not a legacy numeric ID or historyKey. */
  orderId: string;
  /** Cancels this lookup. The caller owns retry and polling policy. */
  signal?: AbortSignal;
}

export interface CreateClientOptions {
  /** Disable all analytics events for this client. Defaults to false. */
  disableAnalytics?: boolean;
  /** Optional telemetry owner whose opt-out policy is shared with this client's operations. */
  analytics?: SpotAnalytics;
  /** Trusted order-service base URL, fixed for this client's lifetime. Defaults to production v2. */
  apiUrl?: string;
}

/** Cancellation of a submission request; it cannot cancel an accepted order. */
export interface SubmitOrderOptions {
  signal?: AbortSignal;
}

/** Quote inputs; the selected chain and partner are supplied by the client. */
export type ClientGetQuoteParams = Omit<SwapQuoteParams, "chainId" | "partner" | "apiUrl" | "disableAnalytics">;

export interface RefreshAndPrepareSwapParams {
  /** Reviewed quote; its request parameters are reused unchanged for the refresh. */
  quote: SwapQuote;
  /** Connected signer and recipient, independent of the quote's preview user. */
  account: string;
  /** Cancels the refresh before a signing payload is prepared. */
  signal?: AbortSignal;
  /** Reuse quotes this many milliseconds old or newer. Defaults to 20,000; 0 always refreshes. */
  maxQuoteAgeMillis?: number;
  /** Optional operation reporter from this client's analytics, shared with wallet execution. */
  analytics?: SpotAnalytics;
}

/** Reusable protocol configuration and order operations for one partner and chain. */
export interface SpotClient {
  /** Analytics hooks for this client; disabled by `createClient` options when requested. */
  readonly analytics: SpotAnalytics;
  /** Partner selected when this client was created. */
  readonly partner: Partners;
  /** EVM chain used for configuration, signing, submission, and account history. */
  readonly chainId: number;
  /** Captured order-service base URL; pass it to standalone tracking for custom services. */
  readonly apiUrl: string;
  /** Validated protocol template and EIP-712 domain loaded during initialization. */
  readonly rePermitData: RePermitData;
  /** RePermit contract to use as the ERC-20 approval spender. */
  readonly spenderAddress: Address;
  /** Current partner adapter, included when querying this client's account history. */
  readonly exchangeAddress: Address;

  /**
   * Fetches an exact-input quote using this client's chain and partner.
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

  /**
   * Builds an unsigned order from a reviewed `calculateOrder` result.
   * Adds a fresh start time, deadline, and nonce using this client's configuration.
   * Call after wrapping and confirmed approval, immediately before signing.
   *
   * @param params - Submittable form, reviewed token pair, and signing account.
   * @returns Protocol order, EIP-712 signing request, ERC-20 approval request, and form values.
   * Performs no network requests or wallet operations.
   * @throws If the form cannot be submitted or the input is a native-token placeholder.
   */
  prepareOrder(params: PrepareOrderParams): PreparedOrder;

  /**
   * Builds an unsigned exact-input swap from a reviewed quote.
   * Requires no form, token decimals, balances, or USD prices. The quote must match
   * this client's chain and partner. The signed minimum is the quote's
   * `minimumAmountOut`. `userAddress` supplies the signer and output recipient,
   * including when the quote was fetched with a disconnected preview address.
   * Call after wrapping and confirmed approval, immediately before signing.
   *
   * @param quote - Reviewed quote for this client's chain and partner.
   * @param userAddress - Connected account that will sign and receive the output.
   * @returns Order expiring three minutes after preparation, signing/approval requests, and reviewed amounts.
   * Performs no network requests or wallet operations.
   * @throws If the quote, returned minimum, or signer is invalid.
   *
   * @example
   * const prepared = client.prepareSwap(quote, account);
   */
  prepareSwap(quote: SwapQuote, userAddress: string): PreparedSwap;

  /**
   * Reuses a quote received within maxQuoteAgeMillis (default 20 seconds), otherwise refreshes it.
   * Uses this client's endpoint and preserves the original quote user, slippage,
   * and DEX minimum. A lower refreshed minimumAmountOut throws QUOTE_MINIMUM_DECREASED.
   * Equal or higher minima keep the exact minimum the user originally reviewed.
   * Always prepares fresh signing timestamps/nonce; a local age check does not guarantee a fill.
   * Call after wrapping and confirmed approval, immediately before signing.
   * Performs no wallet operations or submission.
   */
  refreshAndPrepareSwap(params: RefreshAndPrepareSwapParams): Promise<PreparedSwap>;

  /**
   * Posts an already signed order to the order service.
   * Sign the prepared `signingRequest` with the host wallet first; keep that exact
   * order and original signature together. This method performs no wallet operations.
   *
   * @param order - Prepared protocol order whose typed data the wallet signed.
   * @param signature - Original `0x`-prefixed wallet signature, unchanged.
   * @param options - Optional abort signal. Requests time out after 30 seconds; reconcile uncertain acceptance before retrying.
   * @returns Accepted order with its full ID. Acceptance does not confirm a fill;
   * use `waitForOrder({ order })` to await completion.
   * @throws If the request fails, the service rejects it, or its response is invalid.
   * A failed response can leave acceptance uncertain; reconcile before submitting a new order.
   */
  submitOrder(
    order: RePermitOrder,
    signature: `0x${string}`,
    options?: SubmitOrderOptions,
  ): Promise<Order>;

  /**
   * Builds the version-specific on-chain cancellation call for an order.
   * The host wallet calls `cancel` with the returned contract, ABI, and arguments
   * on this client's chain, waits for confirmation, then refreshes the order.
   *
   * @param order - Normalized V1 or V2 order from submission or history on this client's chain.
   * @returns Cancellation request; no transaction is sent by this method.
   * @throws If the cancellation contract address is unavailable.
   */
  getCancelOrderRequest(order: Order): CancelOrderRequest;

  /**
   * Fetches one V2 order by its full signed ID on this client's chain.
   * Makes one request without polling. Use `waitForOrder({ order })` for settlement
   * or `OrderStatus.Completed` to check whether a returned order has filled.
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
   * Fetches account history for this client's partner, chain, and configured adapter.
   * Includes current and older order-sink services and legacy TWAP history by default.
   * `page` and `limit` apply only to the legacy TWAP source.
   *
   * @param params - Account, optional legacy-source switches, pagination, and abort signal.
   * @returns Normalized orders sorted newest first. A successful source can provide
   * partial history if another source fails; use `getAccountOrdersResult` for `legacyLoaded`.
   * @throws If pagination is invalid, no requested source succeeds, or the signal is aborted.
   *
   * @example
   * const orders = await client.getAccountOrders({ account });
   */
  getAccountOrders(params: ClientGetAccountOrdersParams): Promise<Order[]>;

  /**
   * Fetches account history with legacy TWAP source completion information.
   * Uses the same filters and partial-result behavior as `getAccountOrders`.
   *
   * @param params - Account, optional legacy-source switches, pagination, and abort signal.
   * @returns `{ orders, legacyLoaded }`, sorted newest first. `legacyLoaded` is true
   * only when a configured, requested legacy TWAP source succeeds; false also means
   * that source was disabled or unavailable for this partner/chain.
   * @throws If pagination is invalid, no requested source succeeds, or the signal is aborted.
   */
  getAccountOrdersResult(
    params: ClientGetAccountOrdersParams,
  ): Promise<AccountOrdersResult>;
}

// Clients in this SDK instance share the allocator, including quote-only clients.
let latestNonce = 0;
const createNonce = (currentTimeMillis: number): string => {
  latestNonce = Math.max(currentTimeMillis, latestNonce + 1);
  return latestNonce.toString();
};

/** Both preparation paths sign and approve the exact order built from the same template. */
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
    spenderAddress,
  },
});

/**
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
  const analytics = createClientAnalytics(options.analytics, options.disableAnalytics);
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
      deadlineMillis: getDeadline(currentTimeMillis, values.duration, form.module),
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
    // Pure preparation only binds context; telemetry starts when execution/submission starts.
    bindOrderAnalytics(order, createAnalyticsOperation(analytics, {
      account: params.swapperAddress,
      chainId,
      partner,
      module: form.module,
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
    { quote: preparedQuote, userAddress }: PrepareSwapParams,
    reporter = createAnalyticsOperation(analytics, {
      account: userAddress,
      chainId,
      partner,
      module: Module.SWAP,
      inputTokenAddress: preparedQuote.request.inToken,
      outputTokenAddress: preparedQuote.request.outToken,
      inputAmountRaw: preparedQuote.request.inAmount,
      minimumOutputAmountRaw: preparedQuote.minimumAmountOut,
    }),
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
      module: Module.SWAP,
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

  const prepareSwap = (quote: SwapQuote, userAddress: string): PreparedSwap =>
    buildPreparedSwap(captureValidatedSwap(quote, userAddress, chainId, partner));

  const refreshAndPrepareSwap = async ({
    quote,
    account,
    signal,
    maxQuoteAgeMillis = DEFAULT_QUOTE_MAX_AGE_MILLIS,
    analytics: operationAnalytics,
  }: RefreshAndPrepareSwapParams): Promise<PreparedSwap> => {
    const reporter = resolveAnalyticsReporter(analytics, operationAnalytics, {
      ...getQuoteAnalyticsContext(quote?.request),
      minimumOutputAmountRaw: quote?.minimumAmountOut,
      account,
      chainId,
      partner,
      module: Module.SWAP,
    });
    let comparison: {
      reviewedMinimumOutputAmountRaw: string;
      freshMinimumOutputAmountRaw: string;
    } | undefined;
    try {
      signal?.throwIfAborted();
      const input = captureValidatedSwap(quote, account, chainId, partner);
      if (!Number.isFinite(maxQuoteAgeMillis) || maxQuoteAgeMillis < 0) {
        throw new SpotError("INVALID_ARGUMENT", "maxQuoteAgeMillis must be a finite non-negative number");
      }

      const reviewedQuote = input.quote;
      // Check after wallet steps: approvals may have aged the reviewed quote.
      // Zero explicitly opts out, even when the quote arrived in this millisecond.
      if (maxQuoteAgeMillis > 0 && isQuoteFresh(reviewedQuote, maxQuoteAgeMillis)) {
        observe(() => reporter.onQuoteSuccess({
          reused: true,
          context: getQuoteAnalyticsContext(reviewedQuote.request),
        }));
        return buildPreparedSwap(input, reporter);
      }
      const freshQuote = await fetchQuote({ ...reviewedQuote.request, signal, apiUrl }, reporter);
      signal?.throwIfAborted();

      if (BigInt(freshQuote.minimumAmountOut) < BigInt(reviewedQuote.minimumAmountOut)) {
        comparison = {
          reviewedMinimumOutputAmountRaw: reviewedQuote.minimumAmountOut,
          freshMinimumOutputAmountRaw: freshQuote.minimumAmountOut,
        };
        throw new SpotError(
          "QUOTE_MINIMUM_DECREASED",
          "Swap minimum output decreased. Review a fresh quote before signing.",
        );
      }

      return buildPreparedSwap(input, reporter);
    } catch (error) {
      observe(() => reporter.onQuoteValidationError(error, comparison));
      throw error;
    }
  };

  /**
   * Sends a prepared order and its wallet signature to the order service. The
   * order must already have been signed by the host wallet.
   */
  const submitOrder = (
    order: RePermitOrder,
    signature: `0x${string}`,
    options?: SubmitOrderOptions,
  ): Promise<Order> => {
    const reporter = resolveAnalyticsReporter(analytics, getOrderAnalytics(order));
    observe(() => reporter.onOrderPrepared(order));
    bindOrderAnalytics(order, reporter);
    return submitOrderRequest(order, signature, reporter, options, apiUrl);
  };

  /**
   * Builds the correct v1 or v2 cancellation contract request. It only returns
   * the contract, ABI, and arguments; the host wallet sends the transaction.
   */
  const getCancelOrderRequest = (order: Order): CancelOrderRequest => {
    const contractAddress =
      order.version === 1 ? order.twapAddress : spenderAddress;
    if (!contractAddress) {
      throw new SpotError("CANCELLATION_UNAVAILABLE", "Cancellation contract address is unavailable");
    }

    return {
      order,
      contractAddress,
      args: order.version === 1 ? [order.id] : [[order.repermitDigest]],
      abi: order.version === 1 ? TWAP_ABI : REPERMIT_ABI,
    };
  };

  /**
   * Fetches order history with the partner and chain captured by
   * this client, leaving only account and pagination options to the caller.
   */
  const getConfiguredAccountOrdersResult = (
    params: ClientGetAccountOrdersParams,
  ): Promise<AccountOrdersResult> =>
    getAccountOrdersResult({
      ...params,
      chainId,
      partner,
      exchangeAddress,
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

  return Object.freeze({
    analytics,
    partner,
    chainId,
    apiUrl,
    rePermitData,
    spenderAddress,
    exchangeAddress,
    getQuote,
    prepareOrder,
    prepareSwap,
    refreshAndPrepareSwap,
    submitOrder,
    getCancelOrderRequest,
    getOrder: async (params: ClientGetOrderParams): Promise<Order | undefined> => {
      const order = await getOrder({ ...params, chainId, apiUrl });
      if (order) bindTrackingAnalytics(order);
      return order;
    },
    getAccountOrdersResult: getConfiguredAccountOrdersResult,
    getAccountOrders: async (params: ClientGetAccountOrdersParams): Promise<Order[]> =>
      (await getConfiguredAccountOrdersResult(params)).orders,
  });
};

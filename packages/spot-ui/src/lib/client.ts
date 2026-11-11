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
import { MAX_UINT_256 } from "./evm-constants";
import { fetchRePermitData } from "./fetch-repermit-data";
import type {
  CalculatedOrderForm,
  CalculatedOrderValues,
} from "./order-form/types";
import { captureValidatedOrderForm } from "./order-form/capture-order-form";
import { isNativeAddress } from "./utils";
import {
  getClientOrders as fetchClientOrders,
  type AccountOrdersResult,
  type GetClientOrdersParams,
} from "./orders";
import { submitOrder as submitOrderRequest } from "./submit-order";
import { getOrder } from "./orders/v2-orders";
import { SpotError } from "./errors";
import { getApiEndpoint } from "./api-config";
import { fetchQuote, getQuoteAnalyticsContext, isQuoteFresh, type SwapQuote, type SwapQuoteParams } from "./quote";
import { observe } from "./observe";
import { MIN_FILL_DELAY_MILLIS, SWAP_ORDER_DURATION_MILLIS, SWAP_ORDER_SLIPPAGE_BPS } from "./order-form/constants";
import type { PreparedSwap } from "./swap";
import { getClientCreationAnalytics, registerClientInternals } from "./internal/client";
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

const getDeadline = (
  currentTimeMillis: number,
  duration: TimeDuration,
): number => currentTimeMillis + duration.unit * duration.value + 60_000;

/** Reviewed advanced-order inputs for preparation without a wallet adapter. */
export interface PrepareOrderParams {
  /** Reviewed result of `calculateOrder`; `form.canSubmit` must be true. */
  form: CalculatedOrderForm;
  /** ERC-20 token spent by the order; pass the wrapped token for native input. */
  inputTokenAddress: string;
  /** Output-token address for the reviewed pair. */
  outputTokenAddress: string;
  /** Account that owns the input tokens and will sign the order. */
  account: string;
}

/** EIP-712 payload to pass to the host wallet's typed-data signing method. */
export interface Eip712TypedData {
  /** Signing domain for the client's chain and RePermit verifying contract. */
  domain: RePermitData["domain"];
  /** Named EIP-712 struct definitions to forward unchanged to the wallet signer. */
  types: RePermitData["types"];
  /** Root EIP-712 struct name to forward unchanged to the wallet signer. */
  primaryType: string;
  /** Exact protocol order to sign; submit this same order with the wallet's original signature. */
  message: Pick<RePermitOrder, keyof RePermitOrder>;
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

/** Options for submitting an order that the host has already signed. */
export interface SubmitOrderOptions {
  /** Abort before posting or stop waiting for its response; an accepted order remains valid. */
  signal?: AbortSignal;
}

/** Swap submission uses the same request and cancellation options as order submission. */
export type SubmitSwapOptions = SubmitOrderOptions;

/** Quote inputs; the selected chain and partner are supplied by the client. */
export type ClientGetQuoteParams = Omit<SwapQuoteParams, "chainId" | "partner" | "apiUrl">;

/** Reviewed swap inputs for preparation without a wallet adapter. */
export interface PrepareSwapParams {
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
  /** RePermit contract address to use for ERC-20 allowance reads and approval transactions on this chain. */
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

  /**
   * Prepares a reviewed TWAP, limit, stop-loss, or take-profit order for inline signing.
   * The host owns wrapping, approval, and signing through its existing wallet code.
   * Confirm wrapping and sufficient allowance first, then call this immediately
   * before signing to obtain a fresh nonce, start time, and deadline.
   * Preparation is synchronous and performs no wallet calls or submission.
   *
   * @param params - Submittable calculated form, connected signing account, and ERC-20 input/output addresses. Use the wrapped token address for native input.
   * @returns Detached form snapshot, protocol order, EIP-712 `signingRequest`, approval requirement, and preparation timestamps.
   * @throws `SpotError` if the form, amounts, signer, token addresses, or order settings are invalid.
   *
   * @example
   * const prepared = client.prepareOrder({
   *   form, account, inputTokenAddress, outputTokenAddress,
   * });
   * const { signerAddress, typedData } = prepared.signingRequest;
   * const signature = await walletClient.signTypedData({ ...typedData, account: signerAddress });
   * const accepted = await client.submitOrder(prepared.order, signature);
   */
  prepareOrder(params: PrepareOrderParams): PreparedOrder;
  /**
   * Prepares a reviewed exact-input swap for inline signing without a wallet adapter.
   * Confirm wrapping and sufficient allowance before calling, then sign the
   * returned payload immediately. Fresh quotes are reused; stale quotes refresh
   * the same request and must preserve or improve the reviewed minimum output.
   * This method performs no wallet calls or submission.
   *
   * @param params - Reviewed quote, connected signer/recipient, and optional abort signal for a quote refresh.
   * @returns Protocol order, EIP-712 `signingRequest`, approval requirement, final quote, and preparation timestamps.
   * @throws `SpotError` if the quote is invalid, has a different client context, or refresh lowers its protected minimum. Quote refresh and abort errors propagate.
   *
   * @example
   * const prepared = await client.prepareSwap({ quote, account, signal });
   * const { signerAddress, typedData } = prepared.signingRequest;
   * const signature = await walletClient.signTypedData({ ...typedData, account: signerAddress });
   * const accepted = await client.submitSwap(prepared.order, signature, { signal });
   */
  prepareSwap(params: PrepareSwapParams): Promise<PreparedSwap>;
  /**
   * Submits an order signed inline by the host wallet to this client's order service.
   * Pass the exact order from `prepareOrder()` or `prepareSwap()` and its original
   * wallet signature. Use `submitSwap()` for a clearly named swap path.
   * The host owns wrapping, allowance checks, signing, and
   * duplicate-submission guards. A lost or timed-out response can leave acceptance
   * uncertain; reconcile the original signed order before creating a replacement.
   *
   * @param order - Unchanged prepared protocol order for this client's chain and configuration.
   * @param signature - Original hex-encoded wallet signature, including its `0x` prefix; do not split or normalize it.
   * @param options - Optional abort signal. An abort cannot undo an order already accepted by the service.
   * @returns Accepted `Order` for both swaps and advanced orders. Use `getOrder()` to check later fills; this call does not wait for settlement.
   * @throws `SpotError` for an expired, invalid, or mismatched order, malformed signature, or failed submission. A pre-aborted signal rejects before posting.
   *
   * @example
   * const accepted = await client.submitOrder(prepared.order, signature, { signal });
   * const latest = await client.getOrder({ orderId: accepted.id });
   */
  submitOrder(order: RePermitOrder, signature: `0x${string}`, options?: SubmitOrderOptions): Promise<Order>;

  /**
   * Submits a swap prepared by `prepareSwap()` and signed inline by the host wallet.
   * Provides the swap path's named submission step with the same validation and
   * transport as `submitOrder()`. The host owns wrapping, approval, signing,
   * duplicate-submission guards, and subsequent status polling.
   *
   * @param order - Unchanged `prepared.order` returned by `prepareSwap()` for this client's chain and configuration.
   * @param signature - Original hex-encoded wallet signature, including its `0x` prefix; do not split or normalize it.
   * @param options - Optional abort signal. An abort cannot undo a swap already accepted by the service.
   * @returns Accepted swap `Order`. Use `getOrder()` to check fills; this call does not wait for settlement.
   * @throws `SpotError` for an expired, invalid, or mismatched order, malformed signature, or failed submission. A pre-aborted signal rejects before posting.
   *
   * @example
   * const prepared = await client.prepareSwap({ quote, account, signal });
   * const { signerAddress, typedData } = prepared.signingRequest;
   * const signature = await walletClient.signTypedData({ ...typedData, account: signerAddress });
   * const accepted = await client.submitSwap(prepared.order, signature, { signal });
   */
  submitSwap(order: RePermitOrder, signature: `0x${string}`, options?: SubmitSwapOptions): Promise<Order>;

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
 * Creates a client for swap quotes, signing payloads, submission, and order management.
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
  const buildPreparedOrder = (params: PrepareOrderParams): PreparedOrder => {
    const { form } = params;
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
      swapperAddress: params.account,
      inputAmountPerTrade: values.inputAmountPerTrade,
      minOutputAmountPerTrade: values.minOutputAmountPerTrade,
      triggerOutputAmountPerTrade: values.triggerOutputAmountPerTrade,
      permitData: structuredClone(rePermitData),
      kind: form.orderType,
    });
    const order = permitData.order;
    // Pure preparation only binds context; telemetry starts when execution/submission starts.
    bindOrderAnalytics(order, createAnalyticsOperation(analytics, {
      account: params.account,
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
      ...createOrderRequests(permitData, params.account, values.inputAmount, spenderAddress),
      form,
      values: preparedValues,
    };
  };

  const prepareOrder = (params: PrepareOrderParams): PreparedOrder =>
    buildPreparedOrder({ ...params, form: captureValidatedOrderForm(params) });

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
      permitData: structuredClone(rePermitData),
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
  }: PrepareSwapParams): Promise<PreparedSwap> => {
    const reporter = createAnalyticsOperation(analytics, {
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
    options?.signal?.throwIfAborted();
    if (!order?.witness || !order.permitted) {
      throw new SpotError("INVALID_ARGUMENT", "A prepared protocol order is required");
    }
    for (const token of [order.permitted?.token, order.witness?.input?.token]) {
      if (typeof token !== "string" || !/^0x[0-9a-f]{40}$/i.test(token) || isNativeAddress(token)) {
        throw new SpotError("INVALID_ARGUMENT", "Signed order input must be an ERC-20 token; the host must wrap native input before signing");
      }
    }
    const matchesAddress = (actual: unknown, expected: string): boolean =>
      typeof actual === "string" && actual.toLowerCase() === expected.toLowerCase();
    if (String(order.witness.chainid) !== String(chainId) ||
      !matchesAddress(order.spender, rePermitData.order.spender) ||
      !matchesAddress(order.witness.exchange?.adapter, exchangeAddress) ||
      !matchesAddress(order.witness.reactor, rePermitData.order.witness.reactor) ||
      !matchesAddress(order.witness.executor, rePermitData.order.witness.executor) ||
      !matchesAddress(order.permitted.token, order.witness.input.token)) {
      throw new SpotError("PREPARED_ORDER_MISMATCH", "Signed order does not match this client's chain and protocol configuration");
    }
    if (typeof order.deadline !== "string" || !/^\d+$/.test(order.deadline)) {
      throw new SpotError("INVALID_ARGUMENT", "Signed order must have an integer deadline");
    }
    if (BigInt(Date.now()) > BigInt(order.deadline) * BigInt(1000)) {
      throw new SpotError("ORDER_EXPIRED", "Order expired before submission; prepare and sign a new order");
    }
    if (typeof signature !== "string" || !/^0x(?:[0-9a-f]{2})+$/i.test(signature)) {
      throw new SpotError("INVALID_ARGUMENT", "Signature must be the original hex-encoded wallet signature");
    }
    const reporter = resolveAnalyticsReporter(analytics, getOrderAnalytics(order));
    observe(() => reporter.onOrderPrepared(order));
    bindOrderAnalytics(order, reporter);
    const accepted = await submitOrderRequest(order, signature, reporter, options, apiUrl);
    return accepted;
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
    prepareOrder,
    prepareSwap,
    submitOrder: postSignedOrder,
    submitSwap: postSignedOrder,
    getCancelOrderRequest,
    /** Read one V2 order once; the host owns completion tracking. */
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

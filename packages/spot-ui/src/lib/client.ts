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
import { fetchRePermitData } from "./fetch-repermit-data";
import type {
  CalculatedOrderForm,
  CalculatedOrderValues,
} from "./order-form/types";
import { eqIgnoreCase, isNativeAddress } from "./utils";
import {
  getAccountOrders as fetchAccountOrders,
  type AccountOrdersResult,
  type GetAccountOrdersParams,
} from "./orders";
import { submitOrder as submitOrderRequest } from "./submit-order";
import { getOrder } from "./orders/v2-orders";
import { Module, OrderType } from "./types";
import { SpotError } from "./errors";
import { getApiEndpoint } from "./api-config";
import { fetchQuote, getQuoteAnalyticsContext, isQuoteFresh, type SwapQuote, type SwapQuoteParams } from "./quote";
import { observe } from "./observe";
import { MIN_FILL_DELAY_MILLIS, SWAP_ORDER_DURATION_MILLIS, SWAP_ORDER_SLIPPAGE_BPS } from "./order-form/constants";
import { executeSwap as executeReviewedSwap, type ExecuteSwapParams, type PreparedSwap, type CompletedSwap } from "./swap";
import type { OrderWalletInteractions } from "./execute-order";
import { runOrderExecution } from "./internal/execute-order";
import { getClientCreationAnalytics, registerClientInternals, type InternalExecuteOrderParams, type InternalResumeOrderControls } from "./internal/client";
import { waitForOrder } from "./internal/wait-for-order";
import { captureValidatedSwap, type ReviewedSwapInput } from "./swap-validation";
import type {
  Address,
  Order,
  Partners,
  RePermitData,
  RePermitOrder,
  TimeDuration,
} from "./types";

const DEFAULT_QUOTE_MAX_AGE_MILLIS = 20_000;
// Protocol payloads have no module field; retain known preparation intent instead
// of mistaking a short-lived advanced order for a swap from its timestamps alone.
const preparedModules = new WeakMap<RePermitOrder, Module>();
const acceptedModules = new WeakMap<Order, Module>();

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

/** Reviewed form and connected wallet operations for client.executeOrder. */
export interface ExecuteOrderParams {
  /** Submittable calculated form captured before wallet work begins. */
  form: CalculatedOrderForm;
  /** Connected signer and output recipient. */
  account: string;
  /** ERC-20 input address; use the wrapped token address when the host's shouldWrap callback requests native wrapping. */
  inputTokenAddress: string;
  /** Output token for the reviewed form. */
  outputTokenAddress: string;
  /** Wallet operations that resolve after successful transaction receipts. */
  walletInteractions: OrderWalletInteractions;
  /** Stop later steps; completed transactions and accepted orders remain valid. */
  signal?: AbortSignal;
}

/** Completed swap execution or accepted advanced order, with its prepared payload. */
export interface ExecutedOrder {
  order: Order;
  preparedOrder: PreparedOrder;
  wrapTxHash?: string;
  approvalTxHash?: string;
}

/** Resume an accepted order without signing or submitting another intent. */
export interface ResumeOrderParams {
  /** Accepted order saved from progress updates or OrderSettlementError.order. */
  order: Order;
  /** Stops settlement tracking without cancelling the accepted order. */
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

/** Account-history filters; chain, partner, and current adapter come from the client. */
export type ClientGetAccountOrdersParams = Omit<
  GetAccountOrdersParams,
  "chainId" | "partner" | "exchangeAddress" | "apiUrl"
>;

export interface ClientGetOrderParams {
  /** Full v2 order.id returned by submitSignedOrder, not a legacy numeric ID or historyKey. */
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
export type ClientGetQuoteParams = Omit<SwapQuoteParams, "chainId" | "partner" | "apiUrl" | "disableAnalytics">;

export interface PrepareSwapParams {
  /** Reviewed quote; its request parameters are reused unchanged for the refresh. */
  quote: SwapQuote;
  /** Connected signer and recipient, independent of the quote's preview user. */
  account: string;
  /** Cancels the refresh before a signing payload is prepared. */
  signal?: AbortSignal;
  /** Reuse quotes this many milliseconds old or newer. Defaults to 20,000; 0 always refreshes. */
  maxQuoteAgeMillis?: number;
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
  /** Current partner adapter, included when querying this client's account history. */
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
   * Runs the complete wallet flow for a reviewed calculated order form.
   * Captures the form, checks walletInteractions.shouldWrap, wraps/approves when needed, prepares fresh signing data,
   * signs, and submits once. Swap forms use their reviewed minimum and wait for a
   * confirmed fill; advanced orders resolve at acceptance. Use executeSwap for
   * quote-aware refresh and minimum validation before signing.
   * Concurrent execution for the same client/account is rejected.
   *
   * @param params - Reviewed form, account, ERC-20 token addresses, wallet callbacks, and optional cancellation.
   * @returns Completed swap or accepted advanced order, prepared payload, and any wrap/approval transaction hashes.
   * @throws If the form is invalid, execution is already active, or a wallet/submission step fails.
   * Aborting stops later steps; it does not undo transactions or cancel an accepted order.
   *
   * @example
   * const result = await client.executeOrder({
   *   form, account, inputTokenAddress, outputTokenAddress, walletInteractions,
   * });
   */
  executeOrder(params: ExecuteOrderParams): Promise<ExecutedOrder>;

  /**
   * Resumes an accepted swap's settlement using read-only order lookups.
   * Never opens the wallet or submits the signed order again. If the original
   * tracking window has elapsed, fresh status checks are bounded to 30 seconds.
   * Advanced orders
   * return their supplied snapshot immediately. Use the original client's chain and endpoint.
   *
   * @param params - Saved accepted order and optional cancellation signal.
   * @returns Completed swap, or the supplied advanced-order snapshot.
   * @throws OrderSettlementError if tracking is cancelled, expires, aborts, or cannot confirm a fill.
   * The error retains its orderId and latest order for another read-only recovery attempt.
   * @example
   * const completed = await client.executeOrder({ order: savedOrder, signal });
   */
  executeOrder(params: ResumeOrderParams): Promise<Order>;

  /**
   * Runs the complete wallet flow for a reviewed swap quote; no form is required.
   * Checks walletInteractions.shouldWrap, wraps/approves when needed, checks quote freshness, prepares, signs, submits,
   * and waits internally for a confirmed fill.
   * Uses this client's chain, partner, endpoint, and account execution lock.
   *
   * @param params - Reviewed quote, connected account, wallet callbacks, and optional cancellation.
   * @returns Completed swap intent with its order ID, filled order, deadline, and any wrap/approval transaction hashes.
   * @throws If validation fails, the refreshed minimum decreases, execution is already active, or a wallet/submission step fails.
   * Aborting stops later steps; it does not undo transactions or cancel an accepted order.
   *
   * @example
   * const result = await client.executeSwap({ quote, account, walletInteractions });
   */
  executeSwap(params: ExecuteSwapParams): Promise<CompletedSwap>;

  /**
   * Prepares an unsigned order for applications that manage their own wallet flow.
   * Uses a reviewed `calculateOrder` result; sign its `signingRequest`, then call `submitSignedOrder`.
   * Adds a fresh start time, deadline, and nonce using this client's configuration.
   * The host must finish native wrapping, refresh its ERC-20 balance, and confirm approval before signing.
   *
   * @param params - Submittable form, reviewed token pair, and signing account.
   * @returns Protocol order, EIP-712 signing request, ERC-20 approval request, and form values.
   * Performs no network requests or wallet operations.
   * @throws If the form cannot be submitted or the input is a native-token placeholder.
   */
  prepareOrder(params: PrepareOrderParams): PreparedOrder;

  /**
   * Prepares an unsigned swap for applications that manage their own wallet flow.
   * Sign its `signingRequest`, then call `submitSignedSwap`.
   * Requires no form, token decimals, balances, or USD prices. The quote must match
   * this client's chain and partner. Reuses a quote received within maxQuoteAgeMillis
   * (default 20 seconds), otherwise refreshes it.
   * Uses this client's endpoint and preserves the original quote user, slippage,
   * and DEX minimum. A lower refreshed minimumAmountOut throws QUOTE_MINIMUM_DECREASED.
   * Equal or higher minima keep the exact minimum the user originally reviewed.
   * Always prepares fresh signing timestamps/nonce; a local age check does not guarantee a fill.
   * The host must finish native wrapping, refresh its ERC-20 balance, and confirm approval before signing.
   * Performs no wallet operations or submission.
   *
   * @param params - Reviewed quote, connected signer/recipient, and optional refresh settings.
   * @returns Order expiring three minutes after preparation, signing/approval requests, and reviewed amounts.
   * @throws If the quote or signer is invalid, refresh fails, or the fresh minimum decreases.
   *
   * @example
   * const prepared = await client.prepareSwap({ quote, account });
   */
  prepareSwap(params: PrepareSwapParams): Promise<PreparedSwap>;

  /**
   * Submits a prepared swap that the wallet has already signed.
   * Sign `prepared.signingRequest` with the host wallet before calling this method.
   * Posts `prepared.order` unchanged and waits internally for a confirmed fill.
   *
   * @param prepared - Exact swap returned by `prepareSwap` whose typed data the wallet signed.
   * @param signature - Original `0x`-prefixed wallet signature, unchanged.
   * @param options - Optional cancellation signal.
   * @returns Completed order with confirmed fill amounts.
   * @throws If submission or settlement fails. OrderSettlementError retains the accepted order for recovery.
   *
   * @example
   * const prepared = await client.prepareSwap({ quote, account });
   * const signature = await wallet.signOrder(prepared.signingRequest);
   * const order = await client.submitSignedSwap(prepared, signature);
   */
  submitSignedSwap(
    prepared: PreparedSwap,
    signature: `0x${string}`,
    options?: SubmitOrderOptions,
  ): Promise<Order>;

  /**
   * Submits a protocol order that the wallet has already signed.
   * Sign the prepared `signingRequest` with the host wallet first; keep that exact
   * order and original signature together. This method performs no wallet operations.
   *
   * @param order - Prepared protocol order whose typed data the wallet signed.
   * @param signature - Original `0x`-prefixed wallet signature, unchanged.
   * @param options - Optional cancellation signal. Submission times out after 30 seconds.
   * @returns Completed order for swaps; accepted order for limit, TWAP, and other advanced orders.
   * @throws If the request fails, the service rejects it, or its response is invalid.
   * A failed response can leave acceptance uncertain. After acceptance, OrderSettlementError
   * retains the orderId and latest order; resume through executeOrder({ order }) without resubmission.
   */
  submitSignedOrder(
    order: RePermitOrder,
    signature: `0x${string}`,
    options?: SubmitOrderOptions,
  ): Promise<Order>;

  /**
   * Creates the contract call needed to cancel an order through the host wallet.
   * The host wallet calls `cancel` with the returned contract, ABI, and arguments
   * on this client's chain, waits for confirmation, then refreshes the order.
   *
   * @param order - Normalized V1 or V2 order from submission or history on this client's chain.
   * @returns Cancellation request; no transaction is sent by this method.
   * @throws If the cancellation contract address is unavailable.
   */
  getCancelOrderRequest(order: Order): CancelOrderRequest;

  /**
   * Looks up the latest status of one V2 order by its full signed order ID.
   * Uses this client's chain and endpoint.
   * Makes one request without polling. Use `OrderStatus.Completed` to check for a fill,
   * or executeOrder({ order }) to resume settlement of a saved accepted swap.
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
   * Lists a wallet's order history for this client's partner and chain, newest first.
   * Includes current and older order-sink services and legacy TWAP history by default.
   * `page` and `limit` apply only to the legacy TWAP source.
   *
   * @param params - Account, optional legacy-source switches, pagination, and abort signal.
   * @returns `{ orders, legacyLoaded }`, with newest-first orders and partial results
   * when a source fails. `legacyLoaded` is true only when a configured and requested
   * legacy TWAP source succeeded; false also means disabled, unavailable, or failed.
   * @throws If pagination is invalid, no requested source succeeds, or the signal is aborted.
   *
   * @example
   * const { orders, legacyLoaded } = await client.getAccountOrders({ account });
   */
  getAccountOrders(params: ClientGetAccountOrdersParams): Promise<AccountOrdersResult>;
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
    preparedModules.set(order, form.module);
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
      module: Module.SWAP,
    });
    preparedModules.set(permit.order, Module.SWAP);
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

  /** Check quote freshness and prepare an unsigned swap for the host wallet to sign. */
  const prepareSwap = async ({
    quote,
    account,
    signal,
    maxQuoteAgeMillis = DEFAULT_QUOTE_MAX_AGE_MILLIS,
  }: PrepareSwapParams, operationAnalytics?: SpotAnalytics): Promise<PreparedSwap> => {
    const reporter = resolveAnalyticsReporter(analytics, operationAnalytics, {
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

  /** Execute a reviewed form; swaps wait for a fill while advanced orders resolve at acceptance. */
  const executeReviewedOrder = (params: InternalExecuteOrderParams, requireSwapQuote: boolean): Promise<ExecutedOrder> => {
    const {
      account, inputTokenAddress, outputTokenAddress, walletInteractions,
      completedWrapTxHash, signal, validateContext, onUpdate, wait,
    } = params;
    const reporter = resolveAnalyticsReporter(analytics, params.analytics, {
      account, chainId, partner, module: params.form?.module,
      inputTokenAddress, outputTokenAddress,
      inputAmountRaw: params.form?.inputAmount?.raw,
      minimumOutputAmountRaw: params.form?.values?.minOutputAmountPerTrade,
    });
    let form: CalculatedOrderForm;
    let quote: SwapQuote | undefined;
    try {
      signal?.throwIfAborted();
      if ("nativeInput" in params && params.nativeInput === true) {
        throw new SpotError("INVALID_ARGUMENT", "Wrapping is controlled by walletInteractions.shouldWrap; remove nativeInput");
      }
      if (!params.form?.canSubmit) {
        throw new SpotError("FORM_NOT_SUBMITTABLE", "Order form is not submittable");
      }
      // A wallet approval can await for minutes. Capture all reviewed values now.
      form = structuredClone(params.form);
      if (form.values.inputAmount !== form.inputAmount.raw) {
        throw new SpotError("PREPARED_ORDER_MISMATCH", "Form values do not match the reviewed input amount");
      }
      for (const address of [account, inputTokenAddress, outputTokenAddress]) {
        if (typeof address !== "string" || !/^0x[0-9a-f]{40}$/i.test(address)) {
          throw new SpotError("INVALID_ARGUMENT", "Invalid execution token or signer address");
        }
      }
      if (isNativeAddress(inputTokenAddress) || isNativeAddress(account)) {
        throw new SpotError("INVALID_ARGUMENT", "Use a wrapped ERC-20 input token and a nonzero signing account");
      }
      if (form.module === Module.SWAP && requireSwapQuote) {
        if (!params.quote) {
          throw new SpotError("INVALID_QUOTE", "Pass the original reviewed swap quote when executing a SWAP form");
        }
        quote = captureValidatedSwap(params.quote, account, chainId, partner).quote;
        const request = quote.request;
        if (!eqIgnoreCase(request.inToken, inputTokenAddress) ||
          !eqIgnoreCase(request.outToken, outputTokenAddress) ||
          BigInt(request.inAmount) !== BigInt(form.inputAmount.raw) ||
          BigInt(quote.netAmountOut) !== BigInt(form.outputAmount.raw) ||
          BigInt(quote.minimumAmountOut) !== BigInt(form.values.minOutputAmountPerTrade)) {
          throw new SpotError("QUOTE_CONTEXT_MISMATCH", "Swap quote does not match the reviewed form or tokens");
        }
      }
    } catch (error) {
      observe(() => reporter.onExecutionRequest());
      observe(() => reporter.onExecutionError(error, "preparing"));
      return Promise.reject(error);
    }
    return runOrderExecution({
      account, inputTokenAddress, inputAmountRaw: form.inputAmount.raw,
      walletInteractions, signal,
      prepareOrder: async () => {
        if (!quote) {
          return prepareOrder({ form, inputTokenAddress, outputTokenAddress, swapperAddress: account });
        }
        const prepared = await prepareSwap({ quote, account, signal }, reporter);
        return {
          order: prepared.order,
          signingRequest: prepared.signingRequest,
          approvalRequest: prepared.approvalRequest,
          form,
          values: {
            ...form.values,
            currentTimeMillis: prepared.values.currentTimeMillis,
            deadlineMillis: prepared.values.deadlineMillis,
          },
        };
      },
    }, {
      client, completedWrapTxHash, validateContext, onUpdate, wait, analytics: reporter,
      submitOrder: postSignedOrder,
      settleOrder: form.module === Module.SWAP
        ? (order, onOrderUpdate) => waitForOrder({ order, signal, onUpdate: onOrderUpdate, apiUrl, analytics: reporter })
        : undefined,
    });
  };

  const resumeOrder = (params: ResumeOrderParams, controls: InternalResumeOrderControls = {}): Promise<Order> => {
    if (params.order.chainId !== chainId) {
      return Promise.reject(new SpotError("QUOTE_CONTEXT_MISMATCH", "Resume the order using a client for its original chain"));
    }
    const module = acceptedModules.get(params.order);
    if (module !== undefined ? module !== Module.SWAP : params.order.type !== OrderType.SWAP) {
      return Promise.resolve(params.order);
    }
    return waitForOrder({
      order: params.order, signal: params.signal, onUpdate: controls.onUpdate,
      apiUrl, refreshExpired: true,
      analytics: resolveAnalyticsReporter(analytics, controls.analytics ?? getSubmittedOrderAnalytics(params.order), {
        account: params.order.maker, chainId, partner, orderId: params.order.id,
      }),
    });
  };

  function executeOrder(params: ExecuteOrderParams): Promise<ExecutedOrder>;
  function executeOrder(params: ResumeOrderParams): Promise<Order>;
  function executeOrder(params: ExecuteOrderParams | ResumeOrderParams): Promise<ExecutedOrder | Order> {
    if (!("order" in params)) {
      if ("nativeInput" in params && params.nativeInput === true) {
        return Promise.reject(new SpotError("INVALID_ARGUMENT", "Wrapping is controlled by walletInteractions.shouldWrap; remove nativeInput"));
      }
      const { form, account, inputTokenAddress, outputTokenAddress, walletInteractions, signal } = params;
      return executeReviewedOrder({
        form, account, inputTokenAddress, outputTokenAddress, walletInteractions, signal,
      }, false);
    }
    return resumeOrder({ order: params.order, signal: params.signal });
  }

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
    const module = preparedModules.get(order);
    if (module !== undefined) acceptedModules.set(accepted, module);
    return accepted;
  };

  /** Submit once, then use read-only lookups to confirm swaps while exposing accepted snapshots. */
  const submitAndSettleOrder = async (
    order: RePermitOrder,
    signature: `0x${string}`,
    options: SubmitOrderOptions = {},
    forceSwap = false,
  ): Promise<Order> => {
    const { signal } = options;
    const accepted = await postSignedOrder(order, signature, { signal });
    const reporter = resolveAnalyticsReporter(analytics, getOrderAnalytics(order));
    bindSubmittedOrderAnalytics(accepted, reporter);
    const module = preparedModules.get(order);
    if (!forceSwap && (module !== undefined ? module !== Module.SWAP : accepted.type !== OrderType.SWAP)) return accepted;
    return waitForOrder({
      order: accepted, signal,
      apiUrl, analytics: reporter,
    });
  };

  /** Submit a signed order; swaps resolve after a fill, advanced orders at acceptance. */
  const submitSignedOrder = (
    order: RePermitOrder,
    signature: `0x${string}`,
    options?: SubmitOrderOptions,
  ): Promise<Order> => submitAndSettleOrder(order, signature, options);

  /** Submit the exact prepared swap and signature once, then wait for a confirmed fill. */
  const submitSignedSwap = (
    prepared: PreparedSwap,
    signature: `0x${string}`,
    options?: SubmitOrderOptions,
  ): Promise<Order> => submitAndSettleOrder(prepared.order, signature, options, true);

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
  const getAccountOrders = (
    params: ClientGetAccountOrdersParams,
  ): Promise<AccountOrdersResult> =>
    fetchAccountOrders({
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

  const client: SpotClient = Object.freeze({
    partner,
    chainId,
    apiUrl,
    rePermitData,
    spenderAddress,
    exchangeAddress,
    getQuote,
    executeOrder,
    /** Execute a reviewed quote and wait for its confirmed fill using this client. */
    executeSwap: (params: ExecuteSwapParams): Promise<CompletedSwap> => executeReviewedSwap(client, params, postSignedOrder),
    prepareOrder,
    prepareSwap: (params: PrepareSwapParams): Promise<PreparedSwap> => prepareSwap(params),
    submitSignedSwap,
    submitSignedOrder,
    getCancelOrderRequest,
    /** Read one V2 order once; executeOrder({ order }) resumes a saved swap's settlement. */
    getOrder: async (params: ClientGetOrderParams): Promise<Order | undefined> => {
      const order = await getOrder({ ...params, chainId, apiUrl });
      if (order) bindTrackingAnalytics(order);
      return order;
    },
    getAccountOrders,
  });
  registerClientInternals(client, {
    analytics,
    executeOrder: params => executeReviewedOrder(params, true),
    prepareSwap,
    resumeOrder,
  });
  return client;
};

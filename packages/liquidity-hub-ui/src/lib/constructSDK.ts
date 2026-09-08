import { Analytics } from "./analytics";
import { fetchQuote } from "./quote";
import { swap as submitSwap } from "./swap";
import type {
  DexRouterData,
  LiquidityHubAnalytics,
  LiquidityHubSDKOptions,
  Quote,
  QuoteArgs,
} from "./types";
import { getApiUrl, isFreshQuote } from "./util";

const assertSDKOptions = ({
  chainId,
  partner,
}: LiquidityHubSDKOptions): void => {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("Liquidity Hub chainId must be a positive integer");
  }
  if (!partner.trim()) {
    throw new Error("Liquidity Hub partner is required");
  }
};

const createAnalyticsCallbacks = (
  reporter: Analytics,
): LiquidityHubAnalytics => ({
  get liquidityHubId() {
    return reporter.liquidityHubId;
  },
  swap: {
    onSuccess: () => reporter.onSwapSuccess(),
    onFailed: (error) => reporter.onSwapFailed(error),
  },
  dexSwap: (params) => reporter.onDexSwap(params),
  wrap: {
    onRequest: () => reporter.onWrapRequest(),
    onSuccess: (txHash) => reporter.onWrapSuccess(txHash),
    onFailed: (error) => reporter.onWrapFailed(error),
  },
  approval: {
    onRequest: () => reporter.onApprovalRequest(),
    onSuccess: (txHash) => reporter.onApprovalSuccess(txHash),
    onFailed: (error) => reporter.onApprovalFailed(error),
  },
  signature: {
    onRequest: () => reporter.onSignatureRequest(),
    onSuccess: (signature) => reporter.onSignatureSuccess(signature),
    onFailed: (error) => reporter.onSignatureFailed(error),
  },
});

export class LiquidityHubSDK {
  public readonly chainId: number;
  public readonly partner: string;
  public readonly analytics: LiquidityHubAnalytics;

  private readonly apiUrl: string;
  private readonly analyticsReporter: Analytics;
  private activeSwap?: Promise<string>;

  constructor(options: LiquidityHubSDKOptions) {
    assertSDKOptions(options);

    this.chainId = options.chainId;
    this.partner = options.partner.trim().toLowerCase();
    this.apiUrl = getApiUrl(this.chainId, options.apiUrl);
    this.analyticsReporter = new Analytics();
    this.analyticsReporter.init(
      this.chainId,
      this.partner,
      options.blockAnalytics ?? false,
    );
    this.analytics = createAnalyticsCallbacks(this.analyticsReporter);
  }

  /** Requests and validates a Liquidity Hub quote. */
  public getQuote(args: QuoteArgs): Promise<Quote> {
    return fetchQuote(
      args,
      this.partner,
      this.chainId,
      this.apiUrl,
      this.analyticsReporter,
    );
  }

  /** Submits a fresh, signed quote and resolves when its transaction hash is known. */
  public async swap(
    quote: Quote,
    signature: string,
    dexRouterData?: DexRouterData,
  ): Promise<string> {
    if (this.activeSwap) {
      throw new Error("A Liquidity Hub swap is already in progress");
    }
    if (!isFreshQuote(quote)) {
      throw new Error("Liquidity Hub quote expired; request a new quote");
    }
    if (!signature.trim()) {
      throw new Error("Liquidity Hub signature is required");
    }
    if (!quote.user.trim() || !quote.sessionId.trim()) {
      throw new Error("Liquidity Hub quote is missing execution identity");
    }

    const activeSwap = submitSwap(
      quote,
      signature,
      this.chainId,
      this.apiUrl,
      this.analyticsReporter,
      dexRouterData,
    );
    this.activeSwap = activeSwap;

    try {
      return await activeSwap;
    } finally {
      if (this.activeSwap === activeSwap) this.activeSwap = undefined;
    }
  }
}

export const constructSDK = (
  options: LiquidityHubSDKOptions,
): LiquidityHubSDK => new LiquidityHubSDK(options);

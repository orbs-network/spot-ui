import { analyticsInstance } from "./analytics";
import { fetchQuote } from "./quote";
import { swap, getTxDetails } from "./swap";
import { Quote, QuoteArgs } from "./types";

interface Args {
  chainId: number;
  partner: string;
  blockAnalytics?: boolean;
}


const analyticsCallbacks = {
  liquidityHubId: analyticsInstance.globalData.liquidityHubId,
  swap: {
    onSuccess: analyticsInstance.onSwapSuccess.bind(analyticsInstance),
    onFailed: analyticsInstance.onSwapFailed.bind(analyticsInstance),
  },
  dexSwap: analyticsInstance.onDexSwap.bind(analyticsInstance),
  wrap: {
    onRequest: analyticsInstance.onWrapRequest.bind(analyticsInstance),
    onSuccess: analyticsInstance.onWrapSuccess.bind(analyticsInstance),
    onFailed: analyticsInstance.onWrapFailed.bind(analyticsInstance),
  },
  approval: {
    onRequest: analyticsInstance.onApprovalRequest.bind(analyticsInstance),
    onSuccess: analyticsInstance.onApprovalSuccess.bind(analyticsInstance),
    onFailed: analyticsInstance.onApprovalFailed.bind(analyticsInstance),
  },
  signature: {
    onRequest: analyticsInstance.onSignatureRequest.bind(analyticsInstance),
    onSuccess: analyticsInstance.onSignatureSuccess.bind(analyticsInstance),
    onFailed: analyticsInstance.onSignatureFailed.bind(analyticsInstance),
  },
} as const;

class LiquidityHubSDK {
  private chainId?: number;
  private partner: string;
  public analytics = analyticsCallbacks;
  constructor(args: Args) {
    this.chainId = args.chainId;
    this.partner =  args.partner;
    analyticsInstance.init(
      args.chainId,
      args.partner,
      args.blockAnalytics || false
    );
  }

  getQuote(args: QuoteArgs) {
    return fetchQuote(args, this.partner, this.chainId);
  }

  swap(
    quote: Quote,
    signature: string,
    dexRouterData?: { data?: string; to?: string }
  ) {
    return swap(quote, signature, this.chainId, dexRouterData);
  }

  getTransactionDetails(txHash: string, quote: Quote) {
    return getTxDetails(txHash, quote, this.chainId);
  }
}

export { LiquidityHubSDK };
export const constructSDK = (args: Args): LiquidityHubSDK => {
  return new LiquidityHubSDK(args);
};

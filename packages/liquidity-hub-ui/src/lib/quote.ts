import { devLog, getApiUrl } from "./util";
import { analyticsInstance } from "./analytics";
import { Quote, QuoteArgs } from "./types";
const QUOTE_TIMEOUT = 10_000;

export async function promiseWithTimeout<T>(
  promise: Promise<T>,
  timeout: number
): Promise<T> {
  let timer: any;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("quote timeout"));
    }, timeout);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

const safeEncodeURIComponent = () => {
  try {
    if (typeof window !== 'undefined') {
      return encodeURIComponent(window.location.hash || window.location.search);
    }
    return "";
  } catch (error) {
    return "";
  }
};

let currentArgs: QuoteArgs | undefined;
const isArgsChanged = (args: QuoteArgs) => {
  if (
    args.fromToken !== currentArgs?.fromToken ||
    args.toToken !== currentArgs?.toToken ||
    args.inAmount !== currentArgs?.inAmount ||
    args.account !== currentArgs?.account
  ) {
    return true;
  }
  return false;
};

export const fetchQuote = async (
  args: QuoteArgs,
  partner: string,
  chainId?: number,
) => {
  if (!chainId) {
    throw new Error("chainId is missing in constructSDK");
  }
  const apiUrl = getApiUrl(chainId);
  const sessionId = isArgsChanged(args) ? undefined : analyticsInstance.globalData.liquidityHubId;
  currentArgs = args;

  analyticsInstance.onQuoteRequest({
    srcTokenAddress: args.fromToken,
    dstTokenAddress: args.toToken,
    slippage: args.slippage,
    dexMinAmountOut: args.dexMinAmountOut || "",
    inAmount: args.inAmount,
    account: args.account || "",
    inAmountUsd: args.inAmountUsd,
    disabled: args.disabled,
  });

  devLog("quote start", { args });

  try {
    const response = await promiseWithTimeout(
      fetch(`${apiUrl}/quote?chainId=${chainId}`, {
        method: "POST",
        body: JSON.stringify({
          inToken: args.fromToken,
          outToken: args.toToken,
          inAmount: args.inAmount,
          outAmount: !args.dexMinAmountOut ? "-1" : args.dexMinAmountOut,
          user: args.account,
          slippage: args.slippage,
          qs: safeEncodeURIComponent(),
          partner: partner.toLowerCase(),
          sessionId,
        }),
        signal: args.signal,
      }),
      args.timeout || QUOTE_TIMEOUT
    );
    const quote = await response.json();

    if (!quote) {
      throw new Error("No result");
    }

    if (quote.error) {
      throw new Error(quote.error);
    }
    analyticsInstance.onQuoteSuccess(quote);
    const typedQuote = {
      ...quote,
      timestamp: Date.now(),
    } as Quote;
    devLog("quote success", { quote });
    devLog("price compare", {
      lhPrice: typedQuote.userMinOutAmountWithGas,
      dexPrice: args.dexMinAmountOut,
    });
    return typedQuote;
  } catch (error: any) {
    analyticsInstance.onQuoteFailed(error.message);
    devLog("quote error", { error });

    throw new Error(error.message);
  }
};

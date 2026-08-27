import {
  constructSDK,
  isFreshQuote,
  permit2Address,
  type LiquidityHubSDK,
  type Quote,
} from "@orbs-network/liquidity-hub-sdk";

export const LIQUIDITY_HUB_PARTNER = "mydex";

export interface LiquidityHubQuoteParams {
  chainId?: number;
  account?: string;
  fromToken?: string;
  toToken?: string;
  inAmount: string;
  dexMinAmountOut?: string;
  slippage: number;
  disabled?: boolean;
}

export interface LiquidityHubQuoteKeyParams {
  chainId: number | null;
  account: string | null;
  fromToken: string | null;
  toToken: string | null;
  inAmount: string;
  dexMinAmountOut: string | null;
  slippage: number;
}

export const liquidityHubKeys = {
  all: ["liquidity-hub"] as const,
  quotes: () => [...liquidityHubKeys.all, "quote"] as const,
  quote: (params: LiquidityHubQuoteKeyParams) =>
    [...liquidityHubKeys.quotes(), params] as const,
};

const terminalQuoteErrors = ["not supported", "no liquidity", "tns", "ldv"];

export function shouldRetryLiquidityHubQuote(
  failureCount: number,
  error: Error,
): boolean {
  const message = error.message.toLowerCase();
  const isTerminal = terminalQuoteErrors.some((value) =>
    message.includes(value),
  );

  return !isTerminal && failureCount < 2;
}

export function createLiquidityHubSDK(chainId: number): LiquidityHubSDK {
  return constructSDK({
    chainId,
    partner: LIQUIDITY_HUB_PARTNER,
  });
}

export function isLiquidityHubBetter(
  quote: Quote | null,
  dexMinAmountOut?: string,
): boolean {
  return Boolean(
    quote &&
      dexMinAmountOut &&
      BigInt(quote.minAmountOut) > BigInt(dexMinAmountOut),
  );
}

export interface WalletAdapter {
  getAllowance(args: {
    token: string;
    owner: string;
    spender: string;
  }): Promise<bigint>;
  approve(args: {
    token: string;
    spender: string;
    amount: bigint;
  }): Promise<string>;
  wrapNative?(args: { wrappedToken: string; amount: bigint }): Promise<string>;
  signQuote(permitData: Quote["permitData"]): Promise<string>;
}

export interface LiquidityHubSwapVariables {
  quote: Quote;
  account: string;
  sourceWasNative: boolean;
  dexMinAmountOut: string;
  dexRouterData?: { data?: string; to?: string };
}

export interface LiquidityHubSwapResult {
  txHash: string;
  quote: Quote;
}

interface ExecuteLiquidityHubSwapParams extends LiquidityHubSwapVariables {
  sdk: LiquidityHubSDK;
  wallet: WalletAdapter;
  getLatestQuote: () => Promise<Quote>;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

const sameAddress = (left: string, right: string): boolean =>
  left.toLowerCase() === right.toLowerCase();

export async function executeLiquidityHubSwap({
  sdk,
  wallet,
  getLatestQuote,
  quote,
  account,
  sourceWasNative,
  dexMinAmountOut,
  dexRouterData,
}: ExecuteLiquidityHubSwapParams): Promise<LiquidityHubSwapResult> {
  if (sourceWasNative) {
    if (!wallet.wrapNative) {
      throw new Error("Native-token wrapping is not configured");
    }

    sdk.analytics.wrap.onRequest();
    try {
      const txHash = await wallet.wrapNative({
        wrappedToken: quote.inToken,
        amount: BigInt(quote.inAmount),
      });
      sdk.analytics.wrap.onSuccess(txHash);
    } catch (error) {
      sdk.analytics.wrap.onFailed(getErrorMessage(error));
      throw error;
    }
  }

  const allowance = await wallet.getAllowance({
    token: quote.inToken,
    owner: account,
    spender: permit2Address,
  });

  if (allowance < BigInt(quote.inAmount)) {
    sdk.analytics.approval.onRequest();
    try {
      const txHash = await wallet.approve({
        token: quote.inToken,
        spender: permit2Address,
        amount: BigInt(quote.inAmount),
      });
      sdk.analytics.approval.onSuccess(txHash);
    } catch (error) {
      sdk.analytics.approval.onFailed(getErrorMessage(error));
      throw error;
    }
  }

  // Wallet confirmations take time, so refresh before signing.
  const latestQuote = await getLatestQuote();

  if (!isFreshQuote(latestQuote, 60)) {
    throw new Error("Liquidity Hub quote expired; request a new quote");
  }

  if (
    !sameAddress(latestQuote.inToken, quote.inToken) ||
    !sameAddress(latestQuote.outToken, quote.outToken) ||
    latestQuote.inAmount !== quote.inAmount ||
    !sameAddress(latestQuote.user, account)
  ) {
    throw new Error("Swap inputs changed while preparing the transaction");
  }

  if (!isLiquidityHubBetter(latestQuote, dexMinAmountOut)) {
    throw new Error("The DEX route now has the better minimum output");
  }

  sdk.analytics.signature.onRequest();
  let signature: string;
  try {
    signature = await wallet.signQuote(latestQuote.permitData);
    sdk.analytics.signature.onSuccess(signature);
  } catch (error) {
    sdk.analytics.signature.onFailed(getErrorMessage(error));
    throw error;
  }

  if (!isFreshQuote(latestQuote, 60)) {
    throw new Error("Liquidity Hub quote expired while awaiting signature");
  }

  const txHash = await sdk.swap(latestQuote, signature, dexRouterData);
  sdk.analytics.swap.onSuccess();
  return { txHash, quote: latestQuote };
}

// Optional SDK-orchestrated flow with a calculated UI preview.
// Existing DEX wallet flows should start with router-swap.ts instead.
import {
  calculateOrder,
  type OrderWalletInteractions,
  type CompletedSwap,
  Module,
  type Address,
  type CalculatedOrderForm,
  type SpotClient,
  type SwapQuote,
  type Token,
} from "@orbs-network/spot-ui";

/** Supply shouldWrap plus confirmed wrap/approval operations bound to the preview's account and chain. */
export type SwapWallet = OrderWalletInteractions;

export interface SwapPreview {
  client: SpotClient;
  account: Address;
  inputToken: Token;
  outputToken: Token;
  quote: SwapQuote;
  form: CalculatedOrderForm;
}

/** Quote and calculate a displayable form; this does not open the wallet. */
export async function createSwapPreview(params: {
  client: SpotClient;
  account: Address;
  /** Protocol ERC-20 input; use the configured wrapped token for a native selection. */
  inputToken: Token;
  outputToken: Token;
  inputAmountUi: string;
  /** Matching integer base units, converted with the host's wallet/token library. */
  inputAmountRaw: string;
  /** Spendable selected-input balance; native balance is valid when wallet.shouldWrap will return true. */
  inputBalanceRaw: string;
  inputTokenUsdPrice: string;
  outputTokenUsdPrice?: string;
  minTradeSizeUsd: number;
  /** Percentage: 0.5 means 0.5%. The signed swap-order field stays at 500 bps. */
  slippage?: number;
  signal?: AbortSignal;
}): Promise<SwapPreview> {
  const { client, account, inputToken, outputToken, slippage = 0.5 } = params;
  if (!Number.isFinite(slippage) || slippage < 0 || slippage >= 100) {
    throw new Error("UI slippage must be at least 0 and less than 100%");
  }
  const { inputAmountRaw } = params;
  if (!/^\d+$/.test(inputAmountRaw) || BigInt(inputAmountRaw) <= 0n) {
    throw new Error("Enter a positive input amount");
  }
  const quote = await client.getQuote({
    inToken: inputToken.address,
    outToken: outputToken.address,
    inAmount: inputAmountRaw,
    user: account,
    slippage,
    dexMinAmountOut: "-1",
    signal: params.signal,
  });
  const minimumOutputAmountRaw = quote.minimumAmountOut;
  const form = calculateOrder({
    module: Module.SWAP,
    inputTokenDecimals: inputToken.decimals,
    outputTokenDecimals: outputToken.decimals,
    quotedOutputAmountRaw: quote.netAmountOut,
    minimumOutputAmountRaw,
    inputBalanceRaw: params.inputBalanceRaw,
    inputTokenUsdPrice: params.inputTokenUsdPrice,
    outputTokenUsdPrice: params.outputTokenUsdPrice,
    minTradeSizeUsd: params.minTradeSizeUsd,
    priceProtectionPercent: 5, // Module.SWAP always signs 500 bps, regardless of this input.
    userInput: { inputAmountUi: params.inputAmountUi, isMarketOrder: false },
  });
  if (BigInt(form.inputAmount.raw) !== BigInt(inputAmountRaw)) {
    throw new Error("Host raw input amount does not match the reviewed UI amount");
  }
  return { client, account, inputToken, outputToken, quote, form };
}

/** Call after review. Resolves only after the swap fill is confirmed. */
export async function submitReviewedSwap(preview: SwapPreview, wallet: SwapWallet): Promise<CompletedSwap> {
  const { client, account, quote, form } = preview;
  if (form.module !== Module.SWAP || !form.canSubmit) {
    throw new Error(form.errors.primary?.type ?? "Swap form is not submittable");
  }
  if (form.values.minOutputAmountTotal !== quote.minimumAmountOut) {
    throw new Error("Swap quote does not match the reviewed minimum");
  }
  return client.executeSwap({
    quote, account, walletInteractions: wallet,
  });
}

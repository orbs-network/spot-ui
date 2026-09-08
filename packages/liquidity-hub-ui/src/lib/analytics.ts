import { zeroAddress } from "./consts";
import type { DexRouterData, DexSwapAnalyticsParams, Quote } from "./types";
import { eqIgnoreCase, isNativeAddress } from "./util";

type Status = "waiting" | "success" | "failed" | "disabled";
type Stage =
  "init" | "quote" | "approval" | "wrap" | "signature" | "swap" | "dex-swap";
type AnalyticsPayload = Record<string, unknown>;

interface StageData extends AnalyticsPayload {
  _id: string;
  status: Status;
  stage: Stage;
  start: number;
  stageMillis?: number;
  txHash?: string;
  error?: string;
}

interface QuoteRequest {
  srcTokenAddress: string;
  dstTokenAddress: string;
  slippage: number;
  dexMinAmountOut: string;
  inAmount: string;
  account: string;
  inAmountUsd?: number;
  disabled?: boolean;
}

interface GlobalData extends AnalyticsPayload {
  srcTokenAddress?: string;
  dstTokenAddress?: string;
  walletAddress?: string;
  srcAmount?: string;
  inAmountUsd?: number;
  chainId?: number;
  sessionId?: string;
  liquidityHubId?: string;
  partner?: string;
  version?: number;
}

const ANALYTICS_VERSION = 0.92;
const BI_ENDPOINT = `https://bi.orbs.network/putes/liquidity-hub-ui-${ANALYTICS_VERSION}`;
const initializedAnalyticsContexts = new Set<string>();

const claimAnalyticsInitialization = (
  chainId: number,
  partner: string,
): boolean => {
  const contextKey = JSON.stringify([chainId, partner]);
  if (initializedAnalyticsContexts.has(contextKey)) return false;

  initializedAnalyticsContexts.add(contextKey);
  return true;
};

const sendBI = async (data: AnalyticsPayload): Promise<void> => {
  try {
    await fetch(BI_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      keepalive: true,
    });
  } catch {
    // Telemetry must never affect a quote or transaction flow.
  }
};

const generateId = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return `id_${globalThis.crypto.randomUUID()}`;
    }
  } catch {
    // Fall back for runtimes that expose crypto but not a usable randomUUID.
  }

  const random = `${Math.random().toString(36).slice(2)}${Math.random()
    .toString(36)
    .slice(2)}`;
  return `id_${random}${Date.now().toString(36)}`;
};

const getElapsedMillis = (start: number): number =>
  Math.max(0, Date.now() - start);

const getDexOutAmountWithSlippage = (
  dexMinAmountOut: string | number = "0",
  slippage = 0,
): string => {
  try {
    const amount = BigInt(dexMinAmountOut || 0);
    const slippageBasisPoints = BigInt(Math.round(slippage * 100));
    return (amount + (amount * slippageBasisPoints) / 10_000n).toString();
  } catch {
    return "0";
  }
};

const getQuoteValues = (quote: Quote): AnalyticsPayload => ({
  "quote-referencePrice": quote.referencePrice,
  "quote-userMinOutAmountWithGas": quote.userMinOutAmountWithGas,
  "quote-outAmountWsMinusGas": quote.outAmountWsMinusGas,
  "quote-outAmountWS": quote.outAmountWS,
  "quote-minAmountOut": quote.minAmountOut,
  "quote-gasAmountOut": quote.gasAmountOut,
  "quote-permitData": quote.permitData,
  "quote-eip712": quote.eip712,
  "quote-serializedOrder": quote.serializedOrder,
  "quote-exchange": quote.exchange,
  "quote-sessionId": quote.sessionId,
  "quote-outAmount": quote.outAmount,
  "quote-user": quote.user,
  "quote-slippage": quote.slippage,
  "quote-qs": quote.qs,
});

/** Internal, best-effort analytics reporter owned by one client instance. */
export class Analytics {
  private wrapStage?: StageData;
  private approvalStage?: StageData;
  private signatureStage?: StageData;
  private swapStage?: StageData;
  private quoteStage?: StageData;

  private blockAnalytics = false;
  private globalData: GlobalData = {};

  public get liquidityHubId(): string {
    return this.globalData.liquidityHubId ?? "";
  }

  public init(chainId: number, partner: string, blockAnalytics: boolean): void {
    this.blockAnalytics = blockAnalytics;
    const contextIsUnchanged =
      this.globalData.chainId === chainId &&
      this.globalData.partner === partner;

    if (!contextIsUnchanged) {
      this.updateGlobalData({
        chainId,
        partner,
        sessionId: generateId(),
        version: ANALYTICS_VERSION,
      });
    }

    if (
      blockAnalytics ||
      !claimAnalyticsInitialization(chainId, partner)
    ) {
      return;
    }

    this.sendData({
      stage: "init",
    });
  }

  public onQuoteRequest(args: QuoteRequest): StageData {
    this.resetSessionIfNeeded(args);
    const stage = this.startStage(
      "quote",
      {
        srcTokenAddress: args.srcTokenAddress,
        dstTokenAddress: args.dstTokenAddress,
        slippage: args.slippage,
        walletAddress: args.account,
        dexMinAmountOut: args.dexMinAmountOut,
        dexOutAmountWS: getDexOutAmountWithSlippage(
          args.dexMinAmountOut,
          args.slippage,
        ),
        srcAmount: args.inAmount,
        inAmountUsd: args.inAmountUsd,
      },
      args.disabled ? "disabled" : "waiting",
    );

    this.quoteStage = stage;
    this.updateGlobalData({
      srcTokenAddress: args.srcTokenAddress,
      dstTokenAddress: args.dstTokenAddress,
      walletAddress: args.account,
      srcAmount: args.inAmount,
      inAmountUsd: args.inAmountUsd,
    });
    return stage;
  }

  public onQuoteSuccess(
    quote: Quote,
    requestStage: StageData = this.requireStage(this.quoteStage, "quote"),
  ): void {
    const completed = this.finishStage(requestStage, {
      status: "success",
      minAmountOutLH: quote.userMinOutAmountWithGas,
      liquidityHubId: quote.sessionId,
      ...getQuoteValues(quote),
    });

    const isLatestRequest = requestStage._id === this.quoteStage?._id;
    if (isLatestRequest) {
      this.quoteStage = completed;
    }
    if (isLatestRequest && this.isCurrentQuote(quote)) {
      this.updateGlobalData({ liquidityHubId: quote.sessionId });
    }
  }

  public onQuoteFailed(
    error: string,
    requestStage: StageData = this.requireStage(this.quoteStage, "quote"),
  ): void {
    const completed = this.finishStage(requestStage, {
      status: "failed",
      error,
    });
    if (requestStage._id === this.quoteStage?._id) {
      this.quoteStage = completed;
    }
  }

  public onWrapRequest(): void {
    this.wrapStage = this.startStage("wrap");
  }

  public onWrapSuccess(txHash?: string): void {
    this.wrapStage = this.finishTrackedStage(this.wrapStage, "wrap", {
      status: "success",
      txHash,
    });
  }

  public onWrapFailed(error: string): void {
    this.wrapStage = this.finishTrackedStage(this.wrapStage, "wrap", {
      status: "failed",
      error,
    });
  }

  public onApprovalRequest(): void {
    this.approvalStage = this.startStage("approval");
  }

  public onApprovalSuccess(txHash?: string): void {
    this.approvalStage = this.finishTrackedStage(
      this.approvalStage,
      "approval",
      { status: "success", txHash },
    );
  }

  public onApprovalFailed(error: string): void {
    this.approvalStage = this.finishTrackedStage(
      this.approvalStage,
      "approval",
      { status: "failed", error },
    );
  }

  public onSignatureRequest(): void {
    this.signatureStage = this.startStage("signature");
  }

  public onSignatureSuccess(_signature: string): void {
    this.signatureStage = this.finishTrackedStage(
      this.signatureStage,
      "signature",
      { status: "success" },
    );
  }

  public onSignatureFailed(error: string): void {
    this.signatureStage = this.finishTrackedStage(
      this.signatureStage,
      "signature",
      { status: "failed", error },
    );
  }

  public onSwapRequest(quote: Quote, dexRouterData?: DexRouterData): void {
    this.swapStage = this.startStage("swap", {
      dexRouterData: dexRouterData?.data,
      dexRouterTo: dexRouterData?.to,
      ...getQuoteValues(quote),
    });
  }

  public onSwapTxHash(txHash: string): void {
    const stage = this.swapStage ?? this.createStage("swap");
    this.swapStage = {
      ...stage,
      txHash,
      waitForTxHashMillis: getElapsedMillis(stage.start),
    };
    this.sendData(this.swapStage);
  }

  public onSwapSuccess(): void {
    this.swapStage = this.finishTrackedStage(this.swapStage, "swap", {
      status: "success",
    });
  }

  public onSwapFailed(error: string): void {
    this.swapStage = this.finishTrackedStage(this.swapStage, "swap", {
      status: "failed",
      error,
    });
  }

  public onDexSwap({
    panel,
    router,
    srcTokenAddress,
    dstTokenAddress,
    inAmount,
    inAmountUsd,
    txHash,
  }: DexSwapAnalyticsParams): void {
    this.sendData({
      stage: "dex-swap",
      _id: generateId(),
      panel,
      router,
      srcTokenAddress: isNativeAddress(srcTokenAddress)
        ? zeroAddress
        : srcTokenAddress,
      dstTokenAddress: isNativeAddress(dstTokenAddress)
        ? zeroAddress
        : dstTokenAddress,
      inAmount,
      inAmountUsd,
      txHash,
    });
  }

  private sendData(values: AnalyticsPayload = {}): void {
    if (this.blockAnalytics) return;

    const { start: _start, ...payload } = values;
    void sendBI({ ...this.globalData, ...payload });
  }

  private updateGlobalData(data: Partial<GlobalData>): void {
    this.globalData = { ...this.globalData, ...data };
  }

  private createStage(
    stage: Stage,
    values: AnalyticsPayload = {},
    status: Status = "waiting",
  ): StageData {
    return {
      _id: generateId(),
      stage,
      status,
      start: Date.now(),
      ...values,
    };
  }

  private startStage(
    stage: Stage,
    values: AnalyticsPayload = {},
    status: Status = "waiting",
  ): StageData {
    const data = this.createStage(stage, values, status);
    this.sendData(data);
    return data;
  }

  private finishStage(stage: StageData, values: AnalyticsPayload): StageData {
    const completed = {
      ...stage,
      ...values,
      stageMillis: getElapsedMillis(stage.start),
    } as StageData;
    this.sendData(completed);
    return completed;
  }

  private finishTrackedStage(
    current: StageData | undefined,
    stage: Stage,
    values: AnalyticsPayload,
  ): StageData {
    return this.finishStage(current ?? this.createStage(stage), values);
  }

  private requireStage(
    stage: StageData | undefined,
    stageName: Stage,
  ): StageData {
    return stage ?? this.createStage(stageName);
  }

  private resetSessionIfNeeded(args: QuoteRequest): void {
    const sourceChanged =
      this.globalData.srcTokenAddress !== undefined &&
      !eqIgnoreCase(args.srcTokenAddress, this.globalData.srcTokenAddress);
    const destinationChanged =
      this.globalData.dstTokenAddress !== undefined &&
      !eqIgnoreCase(args.dstTokenAddress, this.globalData.dstTokenAddress);
    const amountChanged =
      this.globalData.srcAmount !== undefined &&
      args.inAmount !== this.globalData.srcAmount;
    const walletChanged =
      this.globalData.walletAddress !== undefined &&
      !eqIgnoreCase(args.account, this.globalData.walletAddress);

    if (sourceChanged || destinationChanged || amountChanged || walletChanged) {
      this.updateGlobalData({
        sessionId: generateId(),
        liquidityHubId: "",
      });
    }
  }

  private isCurrentQuote(quote: Quote): boolean {
    return (
      this.globalData.srcTokenAddress !== undefined &&
      this.globalData.dstTokenAddress !== undefined &&
      this.globalData.walletAddress !== undefined &&
      eqIgnoreCase(quote.inToken, this.globalData.srcTokenAddress) &&
      eqIgnoreCase(quote.outToken, this.globalData.dstTokenAddress) &&
      quote.inAmount === this.globalData.srcAmount &&
      eqIgnoreCase(quote.user, this.globalData.walletAddress)
    );
  }
}

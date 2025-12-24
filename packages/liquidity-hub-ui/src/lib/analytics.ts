import { zeroAddress } from "./consts";
import { DexRouterData, Quote } from "./types";
import { isNativeAddress } from "./util";

type Status = "waiting" | "success" | "failed" | "disabled";
type Stage = "init" | "quote" | "approval" | "wrap" | "signature" | "swap";

const getDexOutAmountWS = (dexMinAmountOut = 0, slippage = 0) => {
  const base = BigInt(dexMinAmountOut);
  const slip = BigInt(Math.round(slippage * 100)) || 0n;
  return (base + (base * slip) / 10000n).toString();
};

const getMillis = (start?: number) => {
  if (!start) {
    return 0;
  }
  return Date.now() - start;
};

const ANALYTICS_VERSION = 0.92;
const BI_ENDPOINT = `https://bi.orbs.network/putes/liquidity-hub-ui-${ANALYTICS_VERSION}`;



const sendBI = async (data: any) => {
  try {
    await fetch(BI_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error(error);
  }
};
function generateId() {
  const part1 = Math.random().toString(36).substring(2, 16); // Generate 16 random characters
  const part2 = Math.random().toString(36).substring(2, 16); // Generate another 16 random characters
  const timestamp = Date.now().toString(36); // Generate a timestamp
  return `id_${part1 + part2 + timestamp}`; // Concatenate all parts
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

interface StageData {
  _id: string;
  status: Status;
  stage: Stage;
  stageMillis?: number;
  txHash: string;
  error: string;
  start: number;
}

interface SignatureStage extends StageData {
  signature: string;
}

interface QuoteStage extends StageData {
  quote: Quote;
  slippage: number;
  walletAddress: string;
  srcTokenAddress: string;
  dstTokenAddress: string;
  dexMinAmountOut: string;
  dexOutAmountWS: string;
  srcAmount: string;
  inAmountUsd?: number;
  liquidityHubId: string;
  "quote-referencePrice": string;
  "quote-userMinOutAmountWithGas": string;
  "quote-outAmountWsMinusGas": string;
  "quote-outAmountWS": string;
  "quote-minAmountOut": string;
  "quote-gasAmountOut": string;
  "quote-permitData": string;
  "quote-eip712": string;
  "quote-serializedOrder": string;
  "quote-exchange": string;
  "quote-sessionId": string;
  "quote-outAmount": string;
  "quote-user": string;
  "quote-slippage": number;
  "quote-qs": string;
  minAmountOutLH: string;
}

interface SwapStage extends StageData {
  receipt?: string;
  txHash: string;
  error: string;
  panel: string;
  router: string;
  dexRouterData?: string;
  dexRouterTo?: string;
  waitForTxHashMillis?: number;
}

interface DexSwapStage {
  panel: string;
  router: string;
  srcTokenAddress?: string;
  dstTokenAddress?: string;
  inAmount?: string;
  inAmountUsd?: number;
  txHash: string;
  stage: Stage;
  _id: string;
}

const getDexKey = (panel: string, router = "") => {
  return `dex-${panel}-${router}` as any;
};

const getQuoteValues = (quote: Quote) => {
  return {
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
  };
};

type GlobalData = {
  srcTokenAddress: string;
  dstTokenAddress: string;
  walletAddress: string;
  srcAmount: string;
  inAmountUsd?: number;
  chainId?: number;
  sessionId: string;
  liquidityHubId: string;
  partner: string;
  version: number;
};

export class Analytics {
  private wrapStageData = {} as Partial<StageData>;
  private approvalStageData = {} as Partial<StageData>;
  private signatureStageData = {} as Partial<SignatureStage>;
  private swapStageData = {} as Partial<SwapStage>;
  private dexSwapStageData = {} as { [key: string]: DexSwapStage };
  private quoteStageData = {} as Partial<QuoteStage>;

  public blockAnalytics: boolean = false;
  public globalData: GlobalData = {} as GlobalData;
  public sendData(values = {} as Partial<StageData>) {
    if (this.blockAnalytics) {
      return;
    }

    const { start, ...rest } = values;

    sendBI({
      ...this.globalData,
      ...rest,
    });
  }

  /// ----init---- ///
  public init(chainId: number, partner: string, blockAnalytics: boolean) {
    try {
      if (
        this.globalData.chainId === chainId &&
        this.globalData.partner === partner
      ) {
        return;
      }
      this.globalData.chainId = chainId;
      const data = {
        sessionId: generateId(),
        version: ANALYTICS_VERSION,
        chainId,
        partner,
        stage: "init" as const,
      };
      this.blockAnalytics = blockAnalytics;
      this.updateGlobalData({
        partner,
        sessionId: data.sessionId,
        version: ANALYTICS_VERSION,
        chainId,
      });
      this.sendData(data);
    } catch (error) {
      console.error(error);
    }
  }
  private updateGlobalData(data: Partial<GlobalData>) {
    this.globalData = {
      ...this.globalData,
      ...data,
    };
  }

  resetSessionIfNeeded(args: QuoteRequest) {
    try {
      if (
        (this.globalData.srcTokenAddress &&
          args.srcTokenAddress !== this.globalData.srcTokenAddress) ||
        (this.globalData.dstTokenAddress &&
          args.dstTokenAddress !== this.globalData.dstTokenAddress) ||
        (this.globalData.srcAmount &&
          args.inAmount !== this.globalData.srcAmount)
      ) {
        this.updateGlobalData({
          sessionId: generateId(),
          liquidityHubId: "",
        });
      }
    } catch (error) {
      console.error(error);
    }
  }

  /// ----quote---- ///

  onQuoteRequest(args: QuoteRequest) {
    this.resetSessionIfNeeded(args);
    try {
      this.quoteStageData = {
        _id: generateId(),
        start: Date.now(),
        stage: "quote",
        status: args.disabled ? ("disabled" as const) : ("waiting" as const),
        srcTokenAddress: args.srcTokenAddress,
        dstTokenAddress: args.dstTokenAddress,
        slippage: args.slippage,
        walletAddress: args.account,
        dexOutAmountWS: getDexOutAmountWS(
          Number(args.dexMinAmountOut || "0"),
          args.slippage
        ),
        srcAmount: args.inAmount,
        inAmountUsd: args.inAmountUsd,
      };
      this.sendData(this.quoteStageData);
      this.updateGlobalData({
        srcTokenAddress: args.srcTokenAddress,
        dstTokenAddress: args.dstTokenAddress,
        walletAddress: args.account,
        srcAmount: args.inAmount,
        inAmountUsd: args.inAmountUsd,
      });
    } catch (error) {
      console.error(error);
    }
  }

  onQuoteSuccess(quote: Quote) {
    try {
      this.quoteStageData = {
        ...(this.quoteStageData || {}),
        status: "success",
        stageMillis: getMillis(this.quoteStageData.start),
        minAmountOutLH: quote.userMinOutAmountWithGas,
        liquidityHubId: quote.sessionId,
        ...getQuoteValues(quote),
      };
      this.updateGlobalData({
        liquidityHubId: quote.sessionId,
      });

      this.sendData(this.quoteStageData);
    } catch (error) {
      console.error(error);
    }
  }

  onQuoteFailed(error: string) {
    try {
      this.quoteStageData = {
        ...(this.quoteStageData || {}),
        status: "failed",
        error,
      };
      this.sendData(this.quoteStageData);
    } catch (error) {
      console.error(error);
    }
  }

  /// ----wrap---- ///
  onWrapRequest() {
    try {
      this.wrapStageData = {
        stage: "wrap",
        status: "waiting",
        _id: generateId(),
        start: Date.now(),
      };
      this.sendData(this.wrapStageData);
    } catch (error) {
      console.error(error);
    }
  }

  onWrapSuccess(txHash?: string) {
    try {
      this.wrapStageData = {
        ...(this.wrapStageData || {}),
        status: "success",
        txHash,
        stageMillis: getMillis(this.wrapStageData.start),
      };
      this.sendData(this.wrapStageData);
    } catch (error) {
      console.error(error);
    }
  }

  onWrapFailed(error: string) {
    try {
      this.wrapStageData = {
        ...(this.wrapStageData || {}),
        status: "failed",
        error,
      };
      this.sendData(this.wrapStageData);
    } catch (error) {
      console.error(error);
    }
  }

  /// ----approval---- ///
  onApprovalRequest() {
    try {
      this.approvalStageData = {
        stage: "approval",
        status: "waiting",
        _id: generateId(),
        start: Date.now(),
      };
      this.sendData(this.approvalStageData);
    } catch (error) {
      console.error(error);
    }
  }

  onApprovalSuccess(txHash?: string) {
    try {
      this.approvalStageData = {
        ...(this.approvalStageData || {}),
        status: "success",
        txHash,
        stageMillis: getMillis(this.approvalStageData.start),
      };
      this.sendData(this.approvalStageData);
    } catch (error) {
      console.error(error);
    }
  }

  onApprovalFailed(error: string) {
    try {
      this.approvalStageData = {
        ...(this.approvalStageData || {}),
        status: "failed",
        error,
      };
      this.sendData(this.approvalStageData);
    } catch (error) {
      console.error(error);
    }
  }

  /// ----signature---- ///
  onSignatureRequest() {
    try {
      this.signatureStageData = {
        stage: "signature",
        status: "waiting",
        _id: generateId(),
        start: Date.now(),
      };
      this.sendData(this.signatureStageData);
    } catch (error) {
      console.error(error);
    }
  }

  onSignatureSuccess(signature: string) {
    try {
      this.signatureStageData = {
        ...(this.signatureStageData || {}),
        signature,
        status: "success",
        stageMillis: getMillis(this.signatureStageData.start),
      };
      this.sendData(this.signatureStageData);
    } catch (error) {
      console.error(error);
    }
  }

  onSignatureFailed(error: string) {
    try {
      this.signatureStageData = {
        ...(this.signatureStageData || {}),
        status: "failed",
        error,
      };
      this.sendData(this.signatureStageData);
    } catch (error) {
      console.error(error);
    }
  }

  /// ----swap---- ///
  onSwapRequest(quote: Quote, dexRouterData?: DexRouterData) {
    try {
      this.swapStageData = {
        stage: "swap",
        status: "waiting",
        _id: generateId(),
        start: Date.now(),
        dexRouterData: dexRouterData?.data,
        dexRouterTo: dexRouterData?.to,
        ...getQuoteValues(quote),
      };
      this.sendData(this.swapStageData);
    } catch (error) {
      console.error(error);
    }
  }

  onSwapTxHash(txHash: string) {
    try {
      this.swapStageData = {
        ...(this.swapStageData || {}),
        txHash,
        waitForTxHashMillis: getMillis(this.swapStageData.start),
      };
      this.sendData(this.swapStageData);
    } catch (error) {
      console.error(error);
    }
  }

  onSwapSuccess() {
    try {
      this.swapStageData = {
        ...(this.swapStageData || {}),
        status: "success",
        stageMillis: getMillis(this.swapStageData.start),
      };
      this.sendData(this.swapStageData);
    } catch (error) {
      console.error(error);
    }
  }

  onSwapFailed(error: string) {
    try {
      this.swapStageData = {
        ...(this.swapStageData || {}),
        stageMillis: getMillis(this.swapStageData.start),
        error,
        status: "failed",
      };
      this.sendData(this.swapStageData);
    } catch (error) {
      console.error(error);
    }
  }

  /// ----dex-swap---- ///

  onDexSwap({
    panel,
    router,
    srcTokenAddress,
    dstTokenAddress,
    inAmount,
    inAmountUsd,
    txHash,
  }: {
    panel: string;
    router: string;
    srcTokenAddress: string;
    dstTokenAddress: string;
    inAmount: string;
    inAmountUsd?: number;
    txHash: string;
  }) {
    try {
      const key = getDexKey(panel, router);
      this.dexSwapStageData[key] = {
        stage: "dex-swap" as any,
        _id: generateId(),
        panel,
        router,
        srcTokenAddress: isNativeAddress(srcTokenAddress) ? zeroAddress : srcTokenAddress,
        dstTokenAddress: isNativeAddress(dstTokenAddress) ? zeroAddress : dstTokenAddress,
        inAmount,
        inAmountUsd,
        txHash,
      };
      this.sendData(this.dexSwapStageData[key]);
    } catch (error) {
      console.error(error);
    }
  }
}

export const analyticsInstance = new Analytics();

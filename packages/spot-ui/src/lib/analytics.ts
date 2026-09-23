import type {
  Address,
  Hex,
  Module,
  Partners,
  RePermitData,
  RePermitOrder,
} from "./types";


const Version = 0.7;
const BI_ENDPOINT = `https://bi.orbs.network/putes/twap-ui-${Version}`;

// UI version is set by spot-react at runtime to avoid circular dependency
let UI_VERSION = "unknown";


export function setUIVersion(version: string) {
  UI_VERSION = version;
}

function generateId() {
  const part1 = Math.random().toString(36).substring(2, 16); // Generate 16 random characters
  const part2 = Math.random().toString(36).substring(2, 16); // Generate another 16 random characters
  const timestamp = Date.now().toString(36); // Generate a timestamp
  return `id_${part1 + part2 + timestamp}`; // Concatenate all parts
}
interface Token {
  address: string;
  symbol: string;
  decimals: number;
}

const getFetchedConfigDetails = (
  permitData: RePermitData,
  partner: Partners,
) => {
  const { witness } = permitData.order;
  return {
    partner,
    adapter: witness.exchange.adapter,
    executor: witness.executor,
    reactor: witness.reactor,
    repermit: permitData.domain.verifyingContract,
    chainId: permitData.domain.chainId,
    name: permitData.partner,
    domainName: permitData.domain.name,
    domainVersion: permitData.domain.version,
    primaryType: permitData.primaryType,
    spender: permitData.order.spender,
    exchangeRef: witness.exchange.ref,
    exchangeShare: witness.exchange.share,
    exchangeData: witness.exchange.data,
    configFreshness: witness.freshness,
    configExclusivity: witness.exclusivity,
    configEpoch: witness.epoch,
    configSlippage: witness.slippage,
  };
};

type Action =
  | "cancel order"
  | "wrap"
  | "approve"
  | "sign order"
  | "create order"
  | "module-import"
  | "reset"
  | "crash";

interface Data {
  _id: string;
  uiVersion?: string;
  origin?: string;
  actionError?: string;
  cancelOrderSuccess?: boolean;
  orderSubmitted?: boolean;
  orderHash?: string;
  orderSuccess?: boolean;
  action?: Action;
  wrapTxHash?: string;
  cancelOrderTxHash?: string;
  cancelOrderIdsV1?: string[];
  cancelOrderIdsV2?: string[];
  approvalTxHash?: string;
  walletAddress?: string;
  fromTokenAddress?: string;
  fromTokenSymbol?: string;
  toTokenAddress?: string;
  toTokenSymbol?: string;
  fromTokenAmount?: string;
  chunksAmount?: number;
  minDstAmountOutPerTrade?: string;
  triggerPricePerTrade?: string;
  deadline?: number;
  fillDelay?: number;
  srcChunkAmount?: string;
  module?: Module;
  slippage?: number;
  orderType?: "market" | "limit";

  partner?: Partners;
  adapter?: Address;
  executor?: Address;
  reactor?: Address;
  repermit?: Address;
  chainId?: number;
  name?: string;
  domainName?: string;
  domainVersion?: string;
  primaryType?: string;
  spender?: Address;
  exchangeRef?: Address;
  exchangeShare?: number;
  exchangeData?: Hex;
  configFreshness?: number;
  configExclusivity?: number;
  configEpoch?: number;
  configSlippage?: number;
}

const sendBI = async (data: Partial<Data>) => {
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
    console.error("Failed to send BI", error);
  }
};

const getAnalyticsErrorMessage = (error: unknown): string => {
  try {
    if (typeof error === "string" && error.trim()) {
      return error.toLowerCase();
    }
    if (typeof error === "object" && error !== null) {
      const message = Reflect.get(error, "message");
      if (typeof message === "string" && message.trim()) {
        return message.toLowerCase();
      }
      const code = Reflect.get(error, "code");
      if (typeof code === "string" || typeof code === "number") {
        return String(code).toLowerCase();
      }
    }
  } catch {
    // Analytics is observational and must never alter the caller's error path.
  }
  return "unknown error";
};

export class Analytics {
  timeout: ReturnType<typeof setTimeout> | undefined;
  configDetails: Partial<Data> = {};
  moduleImportKey = "";
  data: Data = {
    _id: generateId(),
  };

  async updateAndSend(values = {} as Partial<Data>, noTimeout = false, callback?: () => void) {
    try {
      this.data = {
        ...this.data,
        ...values,
      };
      const payload = { ...this.data };
      if (noTimeout) {
        await sendBI(payload);
        callback?.();
      } else {
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
          void sendBI(payload);
          callback?.();
        }, 1_000);
      }
    } catch (error) {
      console.error("Failed to update and send BI", error);
    }
  }

  onCancelOrderRequest(cancelOrderIds: string[], version: 1 | 2) {
    this.updateAndSend({
      cancelOrderIdsV1: version === 1 ? cancelOrderIds : undefined,
      cancelOrderIdsV2: version === 2 ? cancelOrderIds : undefined,
      action: "cancel order",
      cancelOrderSuccess: false,
      cancelOrderTxHash: undefined,
      actionError: undefined,
    });
  }

  onCancelOrderSuccess(hash?: string) {
    this.updateAndSend({
      cancelOrderTxHash: hash,
      cancelOrderSuccess: true,
    });
  }

  onCancelOrderError(error: unknown) {
    this.onTxError(error);
  }

  onWrapSuccess(wrapTxHash?: string) {
    this.updateAndSend({
      wrapTxHash,
    });
  }

  onWrapRequest() {
    this.updateAndSend({
      action: "wrap",
    });
  }

  onWrapError(error: unknown) {
    this.onTxError(error);
  }

  onApproveRequest() {
    this.updateAndSend({
      action: "approve",
    });
  }

  onApproveSuccess(approvalTxHash?: string) {
    this.updateAndSend({
      approvalTxHash,
    });
  }

  onApproveError(error: unknown) {
    this.onTxError(error);
  }


  onCrash(error: unknown) {
    this.updateAndSend({
      action: "crash",
      actionError: getAnalyticsErrorMessage(error),
    });
  }

  onTxError(error: unknown) {
    this.updateAndSend({ actionError: getAnalyticsErrorMessage(error) });
  }

  onRequestOrder({
    account,
    chainId,
    module,
    srcToken,
    dstToken,
    fromTokenAmount,
    srcChunkAmount,
    minDstAmountOutPerTrade = "",
    triggerPricePerTrade = "",
    deadline,
    fillDelay,
    slippage,
    isMarketOrder,
    chunksAmount,
  }: {
    account: string;
    chainId: number;
    module: Module;
    srcToken: Token;
    dstToken: Token;
    fromTokenAmount: string;
    srcChunkAmount: string;
    minDstAmountOutPerTrade: string;
    triggerPricePerTrade: string;
    deadline: number;
    fillDelay: number;
    slippage: number;
    isMarketOrder: boolean;
    chunksAmount: number;
  }) {
    this.updateAndSend({
      toTokenAddress: dstToken.address,
      toTokenSymbol: dstToken.symbol,
      fromTokenAddress: srcToken.address,
      fromTokenSymbol: srcToken.symbol,
      fromTokenAmount,
      chunksAmount,
      srcChunkAmount,
      minDstAmountOutPerTrade,
      triggerPricePerTrade,
      deadline,
      fillDelay,
      slippage,
      chainId,
      walletAddress: account,
      module,
      orderType: isMarketOrder ? "market" : "limit",
      actionError: undefined,
    });
  }

  onSignOrderRequest(_order: RePermitOrder) {
    this.updateAndSend({
      action: "sign order",
    });
  }

  onSignOrderError(error: unknown) {
    this.onTxError(error);
  }

  onSignOrderSuccess(_signature: string) {
    this.updateAndSend({
      action: "sign order",
    });
  }

  init(partner: Partners, permitData: RePermitData) {
    const details = getFetchedConfigDetails(permitData, partner);
    const moduleImportKey = JSON.stringify(details);
    if (moduleImportKey === this.moduleImportKey) return;
    this.moduleImportKey = moduleImportKey;
    this.configDetails = details;
    const moduleImportData: Data = {
      _id: generateId(),
      action: "module-import",
      uiVersion: UI_VERSION,
      origin: typeof window === "undefined" ? undefined : window.location.origin,
      ...details,
    };
    this.data = moduleImportData;
    void sendBI(moduleImportData);
  }

  onCreateOrderError(error: unknown) {
    this.onTxError(error);
  }

  onCreateOrderRequest() {
    this.updateAndSend({
      action: "create order",
    });
  }
  

  async onCreateOrderSuccess(orderHash?: string): Promise<void> {
    // Flush the completed order before another action can replace its timer.
    clearTimeout(this.timeout);
    const payload = { ...this.data, orderHash, orderSuccess: true };
    this.data = {
      _id: generateId(),
      action: "reset",
      uiVersion: UI_VERSION,
      origin: this.data.origin,
      ...this.configDetails,
    };
    await sendBI(payload);
  }

}

/** @deprecated Use client.analytics for client-scoped events. */
export const analytics = new Analytics();

export type SpotAnalytics = Analytics;

import type {
  Address,
  Config,
  Module,
  Partners,
  RePermitData,
  RePermitOrder,
} from "./types";
import spotPkg from "@orbs-network/spot/package.json";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as Spot from "@orbs-network/spot";


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

const getModuleImportDetails = (
  partner: Partners,
  minChunkSizeUsd: number,
  chainId?: number,
) => ({
  spotVersion: spotPkg.version,
  partner,
  chainId: chainId || 0,
  minChunkSizeUsd,
});

const getFetchedConfigDetails = (
  permitData: RePermitData,
  partner: Partners,
  twapConfig?: Config,
  minChunkSizeUsd?: number,
) => {
  const { witness } = permitData.order;
  const legacyConfig = Spot.config(
    permitData.domain.chainId,
    partner,
  ) as Partial<{
    cosigner: Address;
    fee: Address;
    refinery: Address;
    router: Address;
    type: string;
    wm: Address;
  }> | undefined;
  return {
    spotVersion: spotPkg.version,
    partner,
    cosigner: legacyConfig?.cosigner,
    fee: legacyConfig?.fee,
    refinery: legacyConfig?.refinery,
    router: legacyConfig?.router,
    type: legacyConfig?.type,
    wm: legacyConfig?.wm,
    adapter: witness.exchange.adapter,
    executor: witness.executor,
    reactor: witness.reactor,
    repermit: permitData.domain.verifyingContract,
    chainId: permitData.domain.chainId,
    chainName: twapConfig?.chainName || "",
    twapVersion: twapConfig?.twapVersion || 0,
    twapAddress: twapConfig?.twapAddress || "",
    lensAddress: twapConfig?.lensAddress || "",
    bidDelaySeconds: twapConfig?.bidDelaySeconds || 0,
    minChunkSizeUsd: minChunkSizeUsd || 0,
    name: twapConfig?.name || "",
    exchangeAddress: twapConfig?.exchangeAddress || "",
    exchangeType: twapConfig?.exchangeType || "",
    pathfinderKey: twapConfig?.pathfinderKey || "",
  };
};

type Action =
  | "cancel order"
  | "wrap"
  | "approve"
  | "sign order"
  | "create order"
  | "module-import"
  | "config-update"
  | "reset"
  | "crash";

interface Data {
  _id: string;
  spotVersion?: string;
  uiVersion?: string;
  appId?: string;
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
  order?: RePermitOrder;
  signature?: string;
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
  cosigner?: Address;
  executor?: Address;
  fee?: Address;
  reactor?: Address;
  refinery?: Address;
  repermit?: Address;
  router?: Address;
  type?: string;
  wm?: Address;
  chainName?: string;
  chainId?: number;
  twapVersion?: number;
  twapAddress?: string;
  lensAddress?: string;
  bidDelaySeconds?: number;
  minChunkSizeUsd?: number;
  name?: string;
  exchangeAddress?: string;
  exchangeType?: string;
  pathfinderKey?: string;
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
    }).then();
  } catch (error) {
    console.error("Failed to send BI", error);
  }
};

class Analytics {
  timeout: any = undefined;
  configDetails: Partial<Data> = {};
  configUpdateKey = "";
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
      if (noTimeout) {
        await sendBI(this.data);
        callback?.();
      } else {
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
          sendBI(this.data);
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

  onCancelOrderError(error: any) {
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

  onWrapError(error: any) {
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

  onApproveError(error: any) {
    this.onTxError(error);
  }


  onCrash(error: any) {
    this.updateAndSend({ action: "crash", actionError: error?.message?.toLowerCase() || error?.toLowerCase() });
  }

  onTxError(error: any) {
    const actionError = error?.message?.toLowerCase() || error?.toLowerCase();
    this.updateAndSend({ actionError });
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

  onSignOrderRequest(order: RePermitOrder) {
    this.updateAndSend({
      action: "sign order",
      order: order,
    });
  }

  onSignOrderError(error: any) {
    this.onTxError(error);
  }

  onSignOrderSuccess(signature: string) {
    this.updateAndSend({
      action: "sign order",
      signature: signature,
    });
  }

  init(
    partner: Partners,
    minChunkSizeUsd: number,
    chainId?: number,
    appId?: string,
  ) {
    const moduleImportKey = `${partner}:${chainId || 0}:${appId || ""}`;
    if (moduleImportKey !== this.moduleImportKey) {
      this.moduleImportKey = moduleImportKey;
      const moduleImportData: Data = {
        _id: generateId(),
        action: "module-import",
        uiVersion: UI_VERSION,
        appId,
        ...getModuleImportDetails(partner, minChunkSizeUsd, chainId),
        origin: window.location.origin,
      };
      const configMatchesIntegration =
        this.configDetails.partner === partner &&
        this.configDetails.chainId === (chainId || 0);
      if (!configMatchesIntegration) {
        this.configDetails = {};
      }
      this.data = { ...moduleImportData, ...this.configDetails };
      void sendBI(moduleImportData);
    }
  }

  onFetchedConfig(
    permitData: RePermitData,
    partner: Partners,
    twapConfig?: Config,
    minChunkSizeUsd?: number,
    isDev = false,
  ) {
    const details = getFetchedConfigDetails(
      permitData,
      partner,
      twapConfig,
      minChunkSizeUsd,
    );
    const configUpdateKey = `${partner}:${details.chainId}:${isDev}:${details.repermit}:${details.adapter}:${details.executor}:${details.reactor}`;
    if (configUpdateKey === this.configUpdateKey) return;
    this.configUpdateKey = configUpdateKey;
    this.configDetails = details;
    this.data = { ...this.data, ...details };
    void sendBI({
      _id: generateId(),
      action: "config-update",
      uiVersion: UI_VERSION,
      appId: this.data.appId,
      origin:
        typeof window === "undefined" ? undefined : window.location.origin,
      ...details,
    });
  }

  onCreateOrderError(error: any) {
    this.onTxError(error);
  }

  onCreateOrderRequest() {
    this.updateAndSend({
      action: "create order",
    });
  }
  

  async onCreateOrderSuccess(orderHash?: string) {
    this.updateAndSend(
      {
        orderHash,
        orderSuccess: true,
      },
      undefined,
      () => {
        this.data = {
          _id: generateId(),
          action: "reset",
          uiVersion: UI_VERSION,
          appId: this.data.appId,
          origin: this.data.origin,
          spotVersion: spotPkg.version,
          partner: this.data.partner,
          adapter: this.data.adapter,
          cosigner: this.data.cosigner,
          executor: this.data.executor,
          fee: this.data.fee,
          reactor: this.data.reactor,
          refinery: this.data.refinery,
          repermit: this.data.repermit,
          router: this.data.router,
          type: this.data.type,
          wm: this.data.wm,
          chainName: this.data.chainName || "",
          chainId: this.data.chainId || 0,
          twapVersion: this.data.twapVersion || 0,
          twapAddress: this.data.twapAddress || "",
          lensAddress: this.data.lensAddress || "",
          bidDelaySeconds: this.data.bidDelaySeconds || 0,
          minChunkSizeUsd: this.data.minChunkSizeUsd || 0,
          name: this.data.name || "",
          exchangeAddress: this.data.exchangeAddress || "",
          exchangeType: this.data.exchangeType || "",
          pathfinderKey: this.data.pathfinderKey || "",
        };
      },
    );
  }

}

export const analytics = new Analytics();

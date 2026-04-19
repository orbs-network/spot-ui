import { OrderType, Token } from "./types";
import {
  eqIgnoreCase,
  getNetwork,
  isNativeAddress,
} from "@orbs-network/spot-ui";
import BN from "bignumber.js";

export const toAmountWei = (value?: string, decimals?: number) => {
  if (!decimals || !value || BN(value).isNaN()) return "";
  return BN(value).multipliedBy(BN(10).pow(decimals)).toFixed(0);
};

export const toAmountUi = (value?: string, decimals?: number) => {
  try {
    if (!decimals || !value || BN(value).isNaN()) return "";
    return BN(value).dividedBy(BN(10).pow(decimals)).toFixed();
  } catch (error) {
    console.error(error);
    return "";
  }
};

export const parseError = (error?: any) => {
  const defaultText = "An error occurred.";
  if (!error || !error.message) return defaultText;
  try {
    if (error.message.toLowerCase().includes("rejected")) {
      return "Transaction Rejected";
    }
    return defaultText;
  } catch (error) {
    return defaultText;
  }
};


export const isTxRejected = (error: any) => {
  if (error?.message) {
    return (
      error.message?.toLowerCase()?.includes("rejected") ||
      error.message?.toLowerCase()?.includes("denied")
    );
  }
};

export const ensureWrappedToken = (token: Token, chainId: number) => {
  const network = getNetwork(chainId);
  if (!network) return token;
  if (isNativeAddress(token.address)) {
    return network.wToken;
  }
  return token;
};

export function millisToDays(milliseconds?: number): number {
  if (!milliseconds) return 0;
  const millisecondsInADay = 86400000; // 24 * 60 * 60 * 1000
  return milliseconds / millisecondsInADay;
}

export function millisToMinutes(milliseconds?: number): number {
  if (!milliseconds) return 0;
  const millisecondsInAMinute = 60000; // 60 * 1000
  return milliseconds / millisecondsInAMinute;
}

export const getOrderType = (isMarketOrder: boolean, chunks: number) => {
  if (isMarketOrder) {
    return OrderType.TWAP_MARKET;
  }
  if (chunks === 1) {
    return OrderType.LIMIT;
  }
  return OrderType.TWAP_LIMIT;
};

export const shouldWrapOnly = (
  srcToken?: Token,
  dstToken?: Token,
  chainId?: number
) => {
  const network = getNetwork(chainId);
  return (
    isNativeAddress(srcToken?.address || "") &&
    eqIgnoreCase(dstToken?.address || "", network?.wToken.address || "")
  );
};

export const shouldUnwrapOnly = (
  srcToken?: Token,
  dstToken?: Token,
  chainId?: number
) => {
  const network = getNetwork(chainId);
  return (
    eqIgnoreCase(srcToken?.address || "", network?.wToken.address || "") &&
    isNativeAddress(dstToken?.address || "")
  );
};

export { eqIgnoreCase, isNativeAddress };

export const getExplorerUrl = (txHash: string, chainId?: number) => {
  if (!chainId) return "";
  const network = getNetwork(chainId);
  return `${network?.explorer}/tx/${txHash}`;
};

import { AddressPadding, OrderType, Token } from "./types";
import { formatUnits, parseUnits } from "viem";
import {
  eqIgnoreCase,
  getNetwork,
  isNativeAddress,
  networks,
} from "@orbs-network/spot-ui";
import BN from "bignumber.js";
export const removeCommas = (numStr: string): string => {
  return numStr.replace(/,/g, "");
};

export const toAmountWei = (value?: string, decimals?: number) => {
  if (!decimals || !value || BN(value).isNaN()) return "0";
  return parseUnits(value, decimals).toString();
};

export const toAmountUi = (value?: string, decimals?: number) => {
  try {
    if (!decimals || !value || BN(value).isNaN()) return "0";
    const amount = BN(value).toFixed();
    return formatUnits(BigInt(amount), decimals);
  } catch (error) {
    console.error(error);
    return "0";
  }
};

export const copy = async (text: string) => {
  if (!navigator?.clipboard) {
    console.warn("Clipboard not supported");
    return false;
  }

  // Try to save to clipboard then save it in the state if worked
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn("Copy failed", error);

    return false;
  }
};

export const fillDelayText = (value?: number) => {
  if (!value) {
    return "";
  }

  const secondsTotal = Math.floor(value / 1000);
  const days = Math.floor(secondsTotal / (24 * 60 * 60));
  const hours = Math.floor((secondsTotal % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((secondsTotal % (60 * 60)) / 60);
  const seconds = secondsTotal % 60;

  const arr: string[] = [];

  if (days) {
    arr.push(`${days} days `);
  }
  if (hours) {
    arr.push(`${hours} hours `);
  }
  if (minutes) {
    arr.push(`${minutes} minutes`);
  }
  if (seconds) {
    arr.push(`${seconds} seconds`);
  }

  return arr.join(" ");
};

export const makeElipsisAddress = (
  address?: string,
  padding?: AddressPadding
): string => {
  if (!address) return "";
  return `${address.substring(0, padding?.start || 6)}...${address.substring(
    address.length - (padding?.end || 5)
  )}`;
};

export const parseError = (error?: any) => {
  const defaultText = "An error occurred.";
  if (!error || !error.message) return defaultText;
  try {
    if (error.message.toLowerCase().indexOf("rejected")) {
      return "Transaction Rejected";
    }
    return defaultText;
  } catch (error) {
    return defaultText;
  }
};

export function formatDecimals(
  value?: string,
  scale = 6,
  maxDecimals = 8
): string {
  try {
    if (!value) return "";

    // ─── keep the sign, work with the absolute value ────────────────
    const sign = value.startsWith("-") ? "-" : "";
    const abs = sign ? value.slice(1) : value;

    const [intPart, rawDec = ""] = abs.split(".");

    // Fast-path: decimal part is all zeros (or absent) ───────────────
    if (!rawDec || Number(rawDec) === 0) return sign + intPart;

    /** Case 1 – |value| ≥ 1 *****************************************/
    if (intPart !== "0") {
      const sliced = rawDec.slice(0, scale);
      const cleaned = sliced.replace(/0+$/, ""); // drop trailing zeros
      const trimmed = cleaned ? "." + cleaned : "";
      return sign + intPart + trimmed;
    }

    /** Case 2 – |value| < 1 *****************************************/
    const firstSigIdx = rawDec.search(/[^0]/); // first non-zero position
    if (firstSigIdx === -1) return sign + "0"; // decimal part is all zeros
    if (firstSigIdx + 1 > maxDecimals) return sign + "0"; // too many leading zeros → 0

    const leadingZeros = rawDec.slice(0, firstSigIdx); // keep them
    const maxSignificant = Math.max(0, maxDecimals - firstSigIdx); // cap total decimals
    const significantRaw = rawDec.slice(firstSigIdx).slice(0, Math.min(scale, maxSignificant));
    const significant = significantRaw.replace(/0+$/, ""); // trim trailing zeros

    return significant ? sign + "0." + leadingZeros + significant : sign + "0";
  } catch (error) {
    
    return value || "";
  }
}

export const isTxRejected = (error: any) => {
  if (error?.message) {
    return (
      error.message?.toLowerCase()?.includes("rejected") ||
      error.message?.toLowerCase()?.includes("denied")
    );
  }
};

export const getMinNativeBalance = (chainId: number) => {
  switch (chainId) {
    case networks.base.id:
      return 0.0001;

    default:
      return 0.01;
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

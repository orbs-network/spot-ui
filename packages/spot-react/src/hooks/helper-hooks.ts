import { getNetwork } from "@orbs-network/spot-ui";
import { useCallback, useMemo } from "react";
import { useSpotContext } from "../spot-context";
import BN from "bignumber.js";
import { getExplorerUrl, shouldUnwrapOnly, shouldWrapOnly, toAmountUi, toAmountWei } from "../utils";

function formatDecimals(value?: string, scale = 6, maxDecimals = 8): string {
  try {
    if (!value) return "";
    const sign = value.startsWith("-") ? "-" : "";
    const abs = sign ? value.slice(1) : value;
    const [intPart, rawDec = ""] = abs.split(".");
    if (!rawDec || Number(rawDec) === 0) return sign + intPart;
    if (intPart !== "0") {
      const sliced = rawDec.slice(0, scale);
      const cleaned = sliced.replace(/0+$/, "");
      const trimmed = cleaned ? "." + cleaned : "";
      return sign + intPart + trimmed;
    }
    const firstSigIdx = rawDec.search(/[^0]/);
    if (firstSigIdx === -1) return sign + "0";
    if (firstSigIdx + 1 > maxDecimals) return sign + "0";
    const leadingZeros = rawDec.slice(0, firstSigIdx);
    const maxSignificant = Math.max(0, maxDecimals - firstSigIdx);
    const significantRaw = rawDec.slice(firstSigIdx).slice(0, Math.min(scale, maxSignificant));
    const significant = significantRaw.replace(/0+$/, "");
    return significant ? sign + "0." + leadingZeros + significant : sign + "0";
  } catch {
    return value || "";
  }
}

export const useAmountBN = (decimals?: number, value?: string) => {
  return useMemo(() => toAmountWei(value, decimals), [decimals, value]);
};

export const useAmountUi = (decimals?: number, value?: string) => {
  return useMemo(() => toAmountUi(value, decimals), [decimals, value]);
};

export const useNetwork = () => {
  const { chainId } = useSpotContext();
  return useMemo(() => getNetwork(chainId), [chainId]);
};

export const useExplorerLink = (txHash?: string) => {
  const network = useNetwork();
  return useMemo(() => {
    if (!txHash || !network) return undefined;
    return getExplorerUrl(txHash, network.id);
  }, [txHash, network]);
};

export const useUsdAmount = (amount?: string, usd?: string | number) => {
  return useMemo(() => {
    if (!amount || !usd || BN(amount || "0").isZero() || BN(usd || "0").isZero()) return "";
    return BN(amount || "0")
      .times(usd)
      .toFixed();
  }, [amount, usd]);
};

export const useShouldOnlyWrap = () => {
  const { srcToken, dstToken, chainId } = useSpotContext();

  return useMemo(() => {
    return shouldWrapOnly(srcToken, dstToken, chainId);
  }, [srcToken, dstToken, chainId]);
};

export const useShouldUnwrap = () => {
  const { srcToken, dstToken, chainId } = useSpotContext();

  return useMemo(() => {
    return shouldUnwrapOnly(srcToken, dstToken, chainId);
  }, [srcToken, dstToken, chainId]);
};

export const useShouldWrapOrUnwrapOnly = () => {
  const wrap = useShouldOnlyWrap();
  const unwrap = useShouldUnwrap();

  return wrap || unwrap;
};

export const useDateFormat = (date?: number) => {
  const { overrides } = useSpotContext();
  return useMemo(() => {
    if (overrides?.dateFormat) {
      return overrides.dateFormat(date || 0);
    }
    if (!date) return "";
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }, [date, overrides?.dateFormat]);
};

export function useCopyToClipboard() {
  const { callbacks } = useSpotContext();
  return useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);

        callbacks?.onCopy?.();
      } catch (error) {
        console.error("Copy failed:", error);
      }
    },
    [callbacks?.onCopy],
  );
}

export const useFormatDecimals = (value?: string | number, decimalPlaces?: number) => {
  return useMemo(() => formatDecimals(value?.toString(), decimalPlaces), [value, decimalPlaces]);
};

export const useFormatNumber = ({ value, decimalScale = 3, prefix, suffix }: { value?: string | number; decimalScale?: number; prefix?: string; suffix?: string }) => {
  const _value = useFormatDecimals(value, decimalScale);
  const { overrides } = useSpotContext();
  const numberFormat = overrides?.numberFormat;

  if (numberFormat) {
    return numberFormat(value || "");
  }

  const formatted = useMemo(() => {
    const str = _value || "";
    if (!str) return "";
    const [intPart = "", decPart] = str.split(".");
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const result = decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
    return `${prefix || ""}${result}${suffix || ""}`;
  }, [_value, prefix, suffix]);

  return formatted;
};


import { useCallback, useMemo } from "react";
import { formatDecimals, parseNativeCurrencyAddress, toAmountUI, toAmountWei } from "../utils";
import {useNumericFormat} from "react-number-format";
import { useConnection } from "wagmi";

export const useToAmountUI = (decimals?: number, value?: string) => {
    return useMemo(() => {
       return toAmountUI(value, decimals);
    }, [decimals, value]);
};

export const useFormatDecimals = (value?: string,decimals = 6) => {
    return useMemo(() => {
        return formatDecimals(value, decimals);
    }, [decimals, value]);
};

export const useToAmountWei = (decimals?: number, value?: string) => {
    return useMemo(() => {
        return toAmountWei(value, decimals);
    }, [decimals, value]);
};

export const useFormatNumber = ({ value, decimalScale = 3, prefix, suffix }: { value?: string | number; decimalScale?: number; prefix?: string; suffix?: string }) => {
    const _value = formatDecimals(value?.toString(), decimalScale);
  
    const result = useNumericFormat({
      allowLeadingZeros: true,
      thousandSeparator: ",",
      displayType: "text",
      value: _value || "",
      decimalScale: 18,
      prefix,
      suffix,
    });
  
 
    return result.value?.toString();
  };
  

  export const useParseNativeCurrencyAddress = (address?: string) => {
    const { chainId } = useConnection();
    return useMemo(() => {
        if(!address || !chainId) return undefined;
      return parseNativeCurrencyAddress(address, chainId);
    }, [address, chainId]);
  };

  export const useDateFormat = (date?: number) => {
    return useMemo(() => {
      if (!date) return "";
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    }, [date]);
  };

  export const useCopyToClipboard = () => {
    return useCallback(async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        console.error("Copy failed:", error);
      }
    }, []);
  };
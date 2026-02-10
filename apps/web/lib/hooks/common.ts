import { useMemo } from "react";
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
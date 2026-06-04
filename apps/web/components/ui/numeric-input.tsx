import { NumericFormat } from "react-number-format";
import BN from "bignumber.js";
import { maxUint256 } from "viem";
import { cn } from "@/lib/utils";

export const NumericInput = ({ className = "", allowNegative = false, disabled = false, decimalScale = 18, onBlur, onFocus, placeholder, maxValue, prefix, suffix, value, minAmount, onChange, isLoading = false, ariaLabel, id }: { className?: string, allowNegative?: boolean, disabled?: boolean, decimalScale?: number, onBlur?: () => void, onFocus?: () => void, placeholder?: string, maxValue?: number, prefix?: string, suffix?: string, value?: string, minAmount?: number, onChange: (value: string) => void, isLoading?: boolean, ariaLabel?: string, id?: string }) => {
    const inputValue = value || minAmount || "";

    return (
    <NumericFormat
      className={cn(
        "bg-transparent w-full h-full outline-none text-[26px]",
        className,
        isLoading && "animate-pulse text-transparent bg-[rgba(255,255,255,0.05)] rounded-[10px]"
      )}
      allowNegative={allowNegative}
      disabled={disabled}
      id={id}
      aria-label={ariaLabel}
      decimalScale={decimalScale}
      onBlur={onBlur}
      name="number-input"
      onFocus={onFocus}
      placeholder={placeholder || "0"}
      max={maxValue}
      isAllowed={(values) => {
        const { floatValue = 0 } = values;
        return maxValue
          ? floatValue <= parseFloat(maxValue.toString())
          : BN(floatValue).isLessThanOrEqualTo(maxUint256.toString());
      }}
      prefix={prefix ? `${prefix} ` : ""}
      suffix={suffix ? `${suffix} ` : ""}
      value={disabled && value === "0" ? "" : inputValue}
      thousandSeparator={","}
      decimalSeparator="."
      type="text"
      valueIsNumericString
      min={minAmount}
      onValueChange={(values, _sourceInfo) => {
        if (_sourceInfo.source !== "event") {
          return;
        }

        onChange(values.value === "." ? "0." : values.value);
      }}
    />
  );
};

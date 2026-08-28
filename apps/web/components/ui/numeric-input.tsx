import { NumericFormat } from "react-number-format";
import BN from "bignumber.js";
import { maxUint256 } from "viem";
import { cn } from "@/lib/utils";

interface NumericInputProps {
  className?: string;
  allowNegative?: boolean;
  disabled?: boolean;
  decimalScale?: number;
  onBlur?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  maxValue?: number;
  prefix?: string;
  suffix?: string;
  value?: string;
  minAmount?: number;
  onChange: (value: string) => void;
  isLoading?: boolean;
  name?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  autoComplete?: string;
  inputMode?: "decimal" | "numeric";
}

export const NumericInput = ({
  className = "",
  allowNegative = false,
  disabled = false,
  decimalScale = 18,
  onBlur,
  onFocus,
  placeholder,
  maxValue,
  prefix,
  suffix,
  value,
  minAmount,
  onChange,
  isLoading = false,
  name = "number-input",
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  autoComplete = "off",
  inputMode = "decimal",
}: NumericInputProps) => {
  const inputValue = value || minAmount || "";

  return (
    <NumericFormat
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      autoComplete={autoComplete}
      className={cn(
        "bg-transparent w-full h-full outline-none text-[26px]",
        className,
        isLoading &&
          "animate-pulse rounded-[10px] bg-[rgba(255,255,255,0.05)] text-transparent",
      )}
      allowNegative={allowNegative}
      disabled={disabled}
      decimalScale={decimalScale}
      onBlur={onBlur}
      inputMode={inputMode}
      name={name}
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

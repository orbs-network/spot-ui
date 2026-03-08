import { useFormatNumber } from "../hooks/helper-hooks";

type FormatNumberProps = {
  value?: string | number;
  decimalScale?: number;
  prefix?: string;
  suffix?: string;
  defaultValue?: string;
};

export const FormatNumber = ({
  value,
  decimalScale = 3,
  prefix,
  suffix,
  defaultValue = "-",
}: FormatNumberProps) => {
  const formatted = useFormatNumber({ value, decimalScale, prefix, suffix });
  return <>{formatted ?? defaultValue}</>;
};

import { SelectMenuProps, SelectMeuItem, useFormatNumber } from "@orbs-network/spot-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";
import { useCallback } from "react";
import { NumericInput } from "../ui/numeric-input";

export const SpotSelectMenu = (props: SelectMenuProps) => {
    const onValueChange = useCallback(
      (it: string) => {
        const selected = props.items.find((item) => item.value.toString() === it);
        if (selected) {
          props.onSelect(selected as SelectMeuItem);
        }
      },
      [props]
    );
  
    return (
      <Select
        onValueChange={onValueChange}
        defaultValue={props.selected?.value.toString()}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={props.selected?.text} />
        </SelectTrigger>
        <SelectContent>
          {props.items.map((it) => (
            <SelectItem key={it.value} value={it.value.toString()}>
              {it.text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  export const SpotPriceInput = ({
    symbol,
    value,
    onChange,
    percentage,
    onPercentageChange,
    usd,
    isLoading,
    bottomContent
  }: {
    symbol?: string;
    value: string;
    onChange: (value: string) => void;
    percentage: string;
    onPercentageChange: (value: string) => void;
    usd: string;
    isLoading?: boolean;
    bottomContent?: React.ReactNode;
  }) => {
    const usdF = useFormatNumber({ value: usd });
    return (
     <div className="flex flex-col gap-2 items-stretch bg-background/60 p-2 pb-2 rounded-xl">
       <div className="flex flex-row gap-2 items-stretch">
        <div className="flex-1 flex justify-between bg-accent items-center px-3 py-2 rounded-[12px] gap-3">
          <p className="text-[15px] font-medium text-muted-foreground">
            {symbol}
          </p>
          <div className="flex-1 flex flex-col items-end">
            <NumericInput
              isLoading={isLoading}
              value={value}
              onChange={(it) => onChange(it)}
              className="flex-1 text-right text-[21px]"
            />
            <p className="text-[13px] text-muted-foreground ">${usdF || "0"}</p>
          </div>
        </div>
       
        <div className="w-[100px] bg-accent items-center px-3 py-2 rounded-[12px]">
          <NumericInput
            value={percentage}
            onChange={(it) => onPercentageChange(it)}
            className="text-center text-[21px]"
            placeholder="0.0%"
            suffix="%"
            allowNegative={true}
          />
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground pl-1 font-medium">{bottomContent}</p>
     </div>
    );
  };
  
  export const SpotPriceResetButton = ({ onClick }: { onClick: () => void }) => {
    return (
      <button
        onClick={onClick}
        className="text-[14px] font-medium text-muted-foreground hover:text-primary cursor-pointer"
      >
        Set to default
      </button>
    );
  };
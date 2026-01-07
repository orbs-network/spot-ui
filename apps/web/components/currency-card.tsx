"use client";
import { Currency } from "@/lib/types";
import { CurrencySelector } from "./currency-selector";
import { ChevronDownIcon } from "lucide-react";
import { NumericInput } from "./ui/numeric-input";
import { useBalance } from "@/lib/hooks/use-balances";
import { useCallback } from "react";
import BN from "bignumber.js";
import { formatDecimals } from "@/lib/utils";
import { USD } from "./ui/usd";
import { Balance } from "./ui/balance";
import { CurrencyLogo } from "./ui/currency-logo";

type Props = {
  currency?: Currency;
  onCurrencyChange: (currency: string) => void;
  onAmountChange?: (amount: string) => void;
  amount: string;
  disabled?: boolean;
  hidePercentageButtons?: boolean;
  title?: string;
  isLoading?: boolean;
};

const CurrencySelectorTrigger = ({ currency }: { currency?: Currency }) => {
  return (
    <div className="w-full cursor-pointer bg-secondary p-[6px] flex items-center gap-1 border border-border rounded-full hover:bg-accent/80">
      <CurrencyLogo currency={currency} className="size-7" />
      <p className="text-sm whitespace-nowrap font-medium">
        {currency?.symbol}
      </p>
      <ChevronDownIcon className="size-4" />
    </div>
  );
};

const PERCENTAGE_BUTTONS = [
  {
    label: "25%",
    value: 0.25,
  },
  {
    label: "50%",
    value: 0.5,
  },
  {
    label: "75%",
    value: 0.75,
  },
  {
    label: "100%",
    value: 1,
  },
];

const PercentageButtons = ({
  onAmountChange,
  currency,
}: {
  currency?: Currency;
  onAmountChange: (amount: string) => void;
}) => {
  const { ui: balance } = useBalance(currency);
  const onPercentageClick = useCallback(
    (percentage: number) => {      
      if(BN(balance).decimalPlaces(7).lte(0)) {
        onAmountChange("");
        return;
      }
      onAmountChange(
        formatDecimals(BN(balance).times(percentage).toString(), 8)
      );
    },
    [balance, onAmountChange]
  );
  
  return (
    <div className="cursor-pointer flex items-center gap-1 justify-end  absolute right-[10px] top-[10px]">
      {PERCENTAGE_BUTTONS.map((button) => (
        <div
          key={button.value}
          className="cursor-pointer bg-secondary px-2 py-1 text-[12px] font-medium flex items-center gap-1 border border-border rounded-full hover:bg-accent/80"
          onClick={() => onPercentageClick(button.value)}
        >
          {button.label}
        </div>
      ))}
    </div>
  );
};

export function CurrencyCard({
  currency,
  onCurrencyChange,
  onAmountChange,
  disabled,
  amount,
  title,
  isLoading = false,
}: Props) {
  
  return (
    <div className="flex flex-col gap-2 bg-card p-4 rounded-lg group relative">
      {!disabled && (
        <PercentageButtons
          onAmountChange={onAmountChange ?? (() => {})}
          currency={currency}
        />
      )}
      <p>{title}</p>
      <div className="flex items-center gap-2">
        <NumericInput
          disabled={disabled}
          value={amount}
          onChange={onAmountChange ?? (() => {})}
          isLoading={isLoading}
        />
        <CurrencySelector
          onCurrencyChange={(currency: Currency) =>
            onCurrencyChange(currency.address)
          }
          trigger={<CurrencySelectorTrigger currency={currency} />}
        />
      </div>
      <div className="flex items-center gap-2 justify-between">
        <USD address={currency?.address} amount={amount} />
        <Balance
          currency={currency}
          onAmountChange={onAmountChange ?? (() => {})}
        />
      </div>
    </div>
  );
}


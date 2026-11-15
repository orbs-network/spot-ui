import { Currency } from "@/lib/types";
import { Skeleton } from "./skeleton";
import BN from "bignumber.js";
import { useBalance } from "@/lib/hooks/use-balances";
import { formatDecimals } from "@/lib/utils";

export const Balance = ({
  currency,
  onAmountChange,
}: {
  currency?: Currency;
  onAmountChange?: (amount: string) => void;
}) => {
  const { formatted, ui, isLoading } = useBalance(currency);
  const content = isLoading ? <Skeleton className="h-4 w-[50px]" /> : (
    <span className="text-[13px] text-muted-foreground font-medium">{formatted} {currency?.symbol}</span>
  );
  return onAmountChange ? (
    <button
      type="button"
      disabled={isLoading}
      aria-label={`Use ${currency?.symbol ?? "token"} balance`}
      className="flex items-center gap-2 enabled:cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
      onClick={() => onAmountChange(formatDecimals(BN(ui).toString(), 8))}
    >
      {content}
    </button>
  ) : <div className="flex items-center gap-2">{content}</div>;
};

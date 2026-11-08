import { useCallback } from "react";
import { useOrderForm, useOutputAmount } from "@orbs-network/spot-react";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { Field } from "@/lib/types";
import { formatDecimals } from "@/lib/utils";
import { CurrencyCard } from "../currency-card";
import { USD } from "../ui/usd";

export const TokenPanel = ({ isInputToken }: { isInputToken: boolean }) => {
  const { inputCurrency, outputCurrency, inputAmount, isLoadingTrade } = useDerivedSwap();
  const order = useOrderForm();
  const { amount: outputAmount, isLoading } = useOutputAmount();
  const usdAmount = isInputToken ? order.inputAmount.usd : outputAmount.usd;
  const { handleCurrencyChange, setInputAmount } = useActionHandlers();
  const onTokenChange = useCallback(
    (currency: string) => {
      handleCurrencyChange(
        currency,
        isInputToken ? Field.INPUT : Field.OUTPUT,
      );
    },
    [handleCurrencyChange, isInputToken],
  );

  return (
    <CurrencyCard
      currency={isInputToken ? inputCurrency : outputCurrency}
      onCurrencyChange={onTokenChange}
      onAmountChange={isInputToken ? setInputAmount : undefined}
      amount={
        isInputToken ? inputAmount : formatDecimals(outputAmount.ui, 6)
      }
      title={isInputToken ? "From" : "To"}
      disabled={!isInputToken}
      isLoading={!isInputToken && isLoading}
      usd={
        <USD value={usdAmount} isLoading={isLoadingTrade} />
      }
    />
  );
};

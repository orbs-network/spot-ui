"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useRefetchSelectedCurrenciesBalances } from "@/lib/hooks/use-balances";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useWrappedNativeTransaction } from "@/lib/hooks/use-wrap";
import type { WrappedNativeAction } from "@/lib/types";
import { SubmitSwapButton } from "./submit-swap-button";

export const WrappedNativeButton = ({
  action,
}: {
  action: WrappedNativeAction;
}): React.JSX.Element => {
  const { parsedInputAmount, inputCurrency } = useDerivedSwap();
  const { setInputAmount } = useActionHandlers();
  const { mutateAsync: executeTransaction, isPending } =
    useWrappedNativeTransaction();
  const { mutateAsync: refetchBalances } =
    useRefetchSelectedCurrenciesBalances();
  const label = action === "wrap" ? "Wrap" : "Unwrap";
  const loadingLabel = action === "wrap" ? "Wrapping" : "Unwrapping";
  const successLabel = action === "wrap" ? "Wrapped" : "Unwrapped";

  const execute = useCallback(() => {
    const toastId = toast.loading(
      `${loadingLabel} ${inputCurrency?.symbol}...`,
      { description: "Proceed in wallet" },
    );

    const transaction = executeTransaction({
      action,
      amount: parsedInputAmount,
    });

    void transaction
      .then(() => {
        toast.success(`${successLabel} ${inputCurrency?.symbol}`, {
          id: toastId,
        });
        setInputAmount("");
        void refetchBalances([]).catch(() => undefined);
      })
      .catch(() => {
        toast.error(`${label} failed`, { id: toastId });
      });
  }, [
    action,
    executeTransaction,
    inputCurrency?.symbol,
    label,
    loadingLabel,
    parsedInputAmount,
    refetchBalances,
    setInputAmount,
    successLabel,
  ]);

  return (
    <SubmitSwapButton
      onClick={execute}
      isLoading={isPending}
      text={label}
    />
  );
};

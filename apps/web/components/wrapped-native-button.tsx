"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import BN from "bignumber.js";
import { toast } from "sonner";
import { useConnection } from "wagmi";
import { getConnection } from "wagmi/actions";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useActiveChainId } from "@/lib/hooks/use-active-chain-id";
import { useBalance, useRefetchSelectedCurrenciesBalances } from "@/lib/hooks/use-balances";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { UnconfirmedWrappedNativeTransaction, useWrappedNativeTransaction } from "@/lib/hooks/use-wrap";
import type { WrappedNativeAction } from "@/lib/types";
import { getWrappedNativeCurrency } from "@/lib/utils";
import { wagmiConfig } from "@/lib/wagmi-config";
import { Button } from "./ui/button";

export const WrappedNativeButton = ({
  action,
}: {
  action: WrappedNativeAction;
}): React.JSX.Element => {
  const { parsedInputAmount, inputAmount, inputCurrency, outputCurrency, swapType } = useDerivedSwap();
  const { setInputAmount } = useActionHandlers();
  const chainId = useActiveChainId();
  const { address } = useConnection();
  const { openConnectModal } = useConnectModal();
  const { wei: inputBalance } = useBalance(inputCurrency);
  const { mutateAsync: executeTransaction, complete, operation, isPending } = useWrappedNativeTransaction();
  const { mutateAsync: refetchBalances } = useRefetchSelectedCurrenciesBalances();
  const [isExecuting, setIsExecuting] = useState(false);
  const executing = useRef(false);
  const mounted = useRef(false);
  const scope = [chainId, address, action, inputCurrency?.address, outputCurrency?.address, inputAmount, swapType].join(":");
  const currentScope = useRef(scope);

  useEffect(() => { currentScope.current = scope; }, [scope]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadingLabel = action === "wrap" ? "Wrapping" : "Unwrapping";
  const successLabel = action === "wrap" ? "Wrapped" : "Unwrapped";
  const label = action === "wrap" ? "Wrap" : "Unwrap";
  const wrappedAddress = getWrappedNativeCurrency(chainId)?.address;

  const execute = useCallback(async () => {
    if (executing.current || isPending) return;
    executing.current = true;
    setIsExecuting(true);
    let confirmed = operation?.status === "confirmed";
    const toastId = toast.loading(
      confirmed ? "Refreshing balances…" : operation ? "Checking transaction…" : `${loadingLabel} ${inputCurrency?.symbol}…`,
      { description: operation ? undefined : "Proceed in wallet" },
    );
    const isCurrent = () => {
      const connection = getConnection(wagmiConfig);
      return mounted.current && currentScope.current === scope &&
        connection.status === "connected" && connection.chainId === chainId &&
        connection.address?.toLowerCase() === address?.toLowerCase();
    };

    try {
      const result = await executeTransaction({ action, amount: parsedInputAmount });
      confirmed = true;
      if (result.contextChanged || !isCurrent()) {
        toast.success("Transaction confirmed", {
          id: toastId,
          description: "Your wallet or trade changed. Review your balances before continuing.",
        });
        return;
      }
      // The balance endpoint always refreshes native currency; include its wrapped counterpart too.
      await refetchBalances(wrappedAddress ? [wrappedAddress] : []);
      const requestUnchanged = result.operation.action === action && result.operation.amount === parsedInputAmount;
      if (isCurrent()) {
        if (requestUnchanged) {
          setInputAmount("");
        }
        complete(result.operation.hash);
      }
      toast.success(requestUnchanged ? `${successLabel} ${inputCurrency?.symbol}` : "Transaction confirmed", { id: toastId });
    } catch (error) {
      if (error instanceof UnconfirmedWrappedNativeTransaction) {
        toast.error("Transaction confirmation unavailable", {
          id: toastId,
          description: "Check the submitted transaction again before continuing.",
        });
        return;
      }
      toast.error(confirmed ? "Balance refresh failed" : `${label} failed`, {
        id: toastId,
        description: confirmed
          ? "Your transaction is confirmed. Retry the balance refresh to continue."
          : "Check your wallet and try again.",
      });
    } finally {
      executing.current = false;
      if (mounted.current) setIsExecuting(false);
    }
  }, [
    action, address, chainId, complete, executeTransaction, inputCurrency?.symbol,
    isPending, label, loadingLabel, operation, parsedInputAmount, refetchBalances,
    scope, setInputAmount, successLabel, wrappedAddress,
  ]);

  const amount = BN(parsedInputAmount || "0");
  const enterAmount = !amount.isFinite() || !amount.gt(0);
  const insufficientBalance = BN(inputBalance ?? "0").lt(amount);
  const pending = isExecuting || isPending;
  const text = !address ? "Connect Wallet"
    : operation?.status === "confirmed" ? "Refresh balances"
    : operation ? "Check transaction"
    : pending ? `${loadingLabel}…`
    : enterAmount ? "Enter an amount"
    : insufficientBalance ? "Insufficient balance"
    : label;

  return (
    <Button
      type="button"
      onClick={address ? () => void execute() : openConnectModal}
      isLoading={pending}
      disabled={pending || (Boolean(address) && (!wrappedAddress || (!operation && (enterAmount || insufficientBalance))))}
    >
      {text}
    </Button>
  );
};

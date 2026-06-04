"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAddress } from "viem";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useUtilaWalletSession } from "@/lib/hooks/use-utila-wallet-session";
import { useUtilaStore } from "@/lib/hooks/store";
import {
  fetchBalances,
  getBalancesQueryKey,
} from "@/lib/hooks/use-balances";
import { useCurrenciesQuery } from "@/lib/hooks/use-currencies-query";

export const UtilaConnectWalletDialog = ({
  children,
}: {
  children: (props: { open: () => void }) => ReactNode;
}) => {
  const queryClient = useQueryClient();
  const { chainId, rawWalletAddress, vaultId: savedVaultId } =
    useUtilaWalletSession();
  const { data: currencies, refetch: refetchCurrencies } = useCurrenciesQuery();
  const { setWalletSession } = useUtilaStore();
  const walletAddressParam = rawWalletAddress;
  const vaultIdParam = savedVaultId || "";
  const [open, setOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState(walletAddressParam);
  const [vaultId, setVaultId] = useState(vaultIdParam);
  const [walletAddressError, setWalletAddressError] = useState("");
  const [vaultIdError, setVaultIdError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const openDialog = useCallback(() => {
    setWalletAddress(walletAddressParam);
    setVaultId(vaultIdParam);
    setWalletAddressError("");
    setVaultIdError("");
    setSubmitError("");
    setOpen(true);
  }, [vaultIdParam, walletAddressParam]);
  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);

      if (nextOpen) {
        setWalletAddress(walletAddressParam);
        setVaultId(vaultIdParam);
        setWalletAddressError("");
        setVaultIdError("");
        setSubmitError("");
      }
    },
    [vaultIdParam, walletAddressParam],
  );
  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const nextWalletAddress = walletAddress.trim();
      const nextVaultId = vaultId.trim();
      const nextWalletAddressError = !nextWalletAddress
        ? "Wallet address is required."
        : !isAddress(nextWalletAddress)
          ? "Enter a valid wallet address."
          : "";
      const nextVaultIdError = !nextVaultId ? "Vault ID is required." : "";

      setWalletAddressError(nextWalletAddressError);
      setVaultIdError(nextVaultIdError);
      setSubmitError("");

      if (nextWalletAddressError || nextVaultIdError) return;
      if (!chainId) {
        setSubmitError("Select a chain before connecting.");
        return;
      }

      setSubmitting(true);

      try {
        let tokenList = currencies;

        if (!tokenList?.length) {
          tokenList = (await refetchCurrencies()).data;
        }

        const tokens = tokenList?.map((currency) => currency.address) ?? [];

        if (!tokens.length) {
          throw new Error("Token list is unavailable.");
        }

        await queryClient.fetchQuery({
          gcTime: Infinity,
          queryFn: () =>
            fetchBalances({
              address: nextWalletAddress,
              chainId,
              tokens,
            }),
          queryKey: getBalancesQueryKey(chainId, nextWalletAddress, tokens),
          staleTime: 60_000,
        });

        setWalletSession({
          walletAddress: nextWalletAddress,
          vaultId: nextVaultId,
        });
        setOpen(false);
      } catch (error) {
        console.error(error);
        setSubmitError("Failed to fetch balances. Try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [
      chainId,
      currencies,
      queryClient,
      refetchCurrencies,
      setWalletSession,
      vaultId,
      walletAddress,
    ],
  );

  return (
    <>
      {children({ open: openDialog })}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-[460px] gap-0 rounded-[10px] border-[#e1e3eb] bg-white p-0 text-[#3f4361] shadow-[0_16px_42px_rgba(42,47,74,0.18)]"
          overlayClassName="bg-[#24283f]/45"
        >
          <DialogHeader className="border-b border-[#e5e7ee] px-6 py-5 text-left">
            <DialogTitle className="text-[18px] font-bold leading-6 text-[#2f344e]">
              Connect wallet
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enter a wallet address and vault ID to use the Utila flow.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4 px-6 py-5" onSubmit={onSubmit}>
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[13px] font-semibold text-[#4a4f6c]"
                htmlFor="utila-wallet-address"
              >
                Wallet address
              </label>
              <Input
                aria-invalid={Boolean(walletAddressError)}
                autoComplete="off"
                className="h-11 rounded-[7px] border-[#dfe2ec] bg-white px-3 text-[14px] font-medium text-[#2f344e] shadow-none focus-visible:border-[#4564ff] focus-visible:ring-[#4564ff]/20"
                id="utila-wallet-address"
                onChange={(event) => {
                  setWalletAddress(event.target.value);
                  setWalletAddressError("");
                }}
                value={walletAddress}
              />
              {walletAddressError && (
                <p className="text-[12px] font-medium text-[#f0445a]">
                  {walletAddressError}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[13px] font-semibold text-[#4a4f6c]"
                htmlFor="utila-vault-id"
              >
                Vault ID
              </label>
              <Input
                aria-invalid={Boolean(vaultIdError)}
                autoComplete="off"
                className="h-11 rounded-[7px] border-[#dfe2ec] bg-white px-3 text-[14px] font-medium text-[#2f344e] shadow-none focus-visible:border-[#4564ff] focus-visible:ring-[#4564ff]/20"
                id="utila-vault-id"
                onChange={(event) => {
                  setVaultId(event.target.value);
                  setVaultIdError("");
                }}
                value={vaultId}
              />
              {vaultIdError && (
                <p className="text-[12px] font-medium text-[#f0445a]">
                  {vaultIdError}
                </p>
              )}
            </div>
            {submitError && (
              <div className="rounded-[6px] bg-[#fee8ea] px-3 py-2 text-[13px] font-medium text-[#b42318]">
                {submitError}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2 border-t border-[#eef0f5] pt-4">
              <button
                className="h-10 cursor-pointer rounded-[7px] border border-[#dfe2ec] bg-white px-4 text-[14px] font-semibold text-[#4a4f6c] transition-colors hover:bg-[#f7f7f9] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting}
                onClick={() => setOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="flex h-10 cursor-pointer items-center gap-2 rounded-[7px] bg-[#4564ff] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#3152ff] disabled:cursor-not-allowed disabled:bg-[#cfd0d8]"
                disabled={submitting}
                type="submit"
              >
                Connect
                {submitting && <Spinner className="size-4" />}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

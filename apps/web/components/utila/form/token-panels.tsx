"use client";

import React, { useCallback, useMemo, useState } from "react";
import BN from "bignumber.js";
import { useSpot } from "@orbs-network/spot-react";
import { Virtuoso } from "react-virtuoso";
import {
  ArrowDownIcon,
  ChevronDownIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { CurrencyLogo } from "@/components/ui/currency-logo";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NumericInput } from "@/components/ui/numeric-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useBalance, useBalances } from "@/lib/hooks/use-balances";
import { useCurrencies, useCurrency } from "@/lib/hooks/use-currencies";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useActiveConnection } from "@/lib/hooks/use-active-connection";
import { useUSDPrice } from "@/lib/hooks/use-usd-price";
import { Currency, Field } from "@/lib/types";
import {
  cn,
  formatDecimals,
  isNativeAddress,
  toAmountUI,
} from "@/lib/utils";
import { TOKEN_BALANCE_PROBE_LIMIT, UtilaCard } from "./shared";

const UtilaTokenSelector = ({
  currencyId,
  disabled,
  onlyWithBalance,
  onChange,
}: {
  currencyId?: string;
  disabled?: boolean;
  onlyWithBalance?: boolean;
  onChange: (currencyId: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const tokenListDisabled = disabled || !open;
  const { currencies, isLoading } = useCurrencies(search, {
    disabled: tokenListDisabled,
  });
  const balanceProbeCurrencies = useMemo(
    () =>
      onlyWithBalance
        ? currencies.slice(0, TOKEN_BALANCE_PROBE_LIMIT)
        : [],
    [currencies, onlyWithBalance],
  );
  const balanceProbeAddresses = useMemo(
    () => balanceProbeCurrencies.map((item) => item.address),
    [balanceProbeCurrencies],
  );
  const { data: balances, isLoading: isBalancesLoading } = useBalances({
    addresses: balanceProbeAddresses,
    disabled:
      tokenListDisabled ||
      !onlyWithBalance ||
      balanceProbeAddresses.length === 0,
  });
  const selectableCurrencies = useMemo(() => {
    if (!onlyWithBalance) return currencies;

    return balanceProbeCurrencies.filter((item) =>
      BN(balances?.[item.address] || "0").gt(0),
    );
  }, [balanceProbeCurrencies, balances, currencies, onlyWithBalance]);
  const isTokenListLoading =
    isLoading ||
    (onlyWithBalance && balanceProbeAddresses.length > 0 && isBalancesLoading);
  const isEmpty = !isTokenListLoading && selectableCurrencies.length === 0;

  const currency = useCurrency(currencyId);

  const onSelect = useCallback(
    (selected: Currency) => {
      onChange(selected.address);
      setOpen(false);
      setSearch("");
    },
    [onChange],
  );

  return (
    <Dialog open={open && !disabled} onOpenChange={setOpen}>
      <button
        className={cn(
          "flex h-[38px] w-[135px] min-w-[135px] cursor-pointer items-center justify-center rounded-full border border-[#e7e8eb] bg-white px-0 text-[14px] font-medium leading-none text-[#3f4361] transition-colors hover:bg-[#fafafb] disabled:cursor-not-allowed disabled:text-[#9ca0b3] disabled:opacity-50 disabled:hover:bg-white hover:bg-[#e7e8eb]",
          currency ? "gap-2.5" : "gap-1.5",
        )}
        disabled={disabled}
        onClick={() => setOpen(true)}
        type="button"
      >
        <UtilaTokenLogo currency={currency} />
        <span className="whitespace-nowrap">
          {currency?.symbol ?? "Select token"}
        </span>
        {currency && (
          <ChevronDownIcon
            className={cn(
              "shrink-0 text-[#7a7f94]",
              currency ? "size-4" : "size-3.5",
            )}
          />
        )}
      </button>
      <DialogContent
        className="top-[50%] flex h-[min(calc(100vh-70px),1138px)] lg:max-w-[650px] w-full flex-col gap-0 overflow-hidden rounded-[8px] border-[#e3e5eb] bg-white p-0 text-[#3f4361] shadow-[0_18px_56px_rgba(43,47,74,0.22)]"
        overlayClassName="bg-[#34394f]/48"
        showCloseButton={false}
      >
        <DialogHeader className="flex h-14 flex-row items-center justify-between border-b border-[#e3e5eb] px-8 py-0">
          <DialogTitle className="text-[16px] font-bold text-[#3f4361]">
            Select Token
          </DialogTitle>
          <DialogClose
            aria-label="Close"
            className="rounded-md p-1 text-[#55596a] hover:bg-[#f5f5f7]"
          >
            <XIcon className="size-5" />
          </DialogClose>
        </DialogHeader>
        <div className="px-5 pt-3.5 pb-5">
          <div className="flex h-10 items-center gap-3 rounded-[7px] border border-[#4564ff] px-4 text-[#3f4361]">
            <SearchIcon className="size-4 text-[#3f4361]" />
            <input
              autoFocus
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-medium outline-none placeholder:text-[#777b92]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a token..."
              value={search}
            />
          </div>
        </div>
        <div className="h-[calc(100%-131px)] px-5 pb-5">
          {isTokenListLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  className="flex h-[66px] items-center gap-3 rounded-[7px] border border-[#e3e5eb] px-4"
                  key={index}
                >
                  <Skeleton className="size-6 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          ) : isEmpty ? (
            <div className="flex h-full items-center justify-center text-[15px] font-medium text-[#85899d]">
              No tokens found
            </div>
          ) : (
            <Virtuoso
              data={selectableCurrencies}
              itemContent={(_, item) => (
                <UtilaTokenRow
                  balanceWei={balances?.[item.address]}
                  currency={item}
                  onSelect={onSelect}
                />
              )}
              style={{ height: "100%" }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const UtilaTokenLogo = ({ currency }: { currency?: Currency }) => {
  if (!currency) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center">
        <svg
          aria-hidden="true"
          className="size-6"
          fill="none"
          focusable="false"
          viewBox="0 0 32 32"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M16 32c8.837 0 16-7.163 16-16S24.837 0 16 0 0 7.163 0 16s7.163 16 16 16"
            fill="var(--asset-icon-testnet-color,#4a60ff)"
          />
          <path
            d="M20.8 13.757c-.873-1.5-2.552-2.516-4.48-2.516-2.828 0-5.12 2.185-5.12 4.881s2.292 4.881 5.12 4.881c1.928 0 3.607-1.015 4.48-2.516m-6.72-7.246V8.8m0 14.4v-2.44m3.84-9.52V8.8m0 14.4v-2.44"
            stroke="#fff"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <div className="relative size-6 shrink-0">
      <CurrencyLogo currency={currency} className="size-6" />
    </div>
  );
};

const UtilaTokenRow = ({
  balanceWei,
  currency,
  onSelect,
}: {
  balanceWei?: string;
  currency: Currency;
  onSelect: (currency: Currency) => void;
}) => {
  const balanceRaw = useMemo(
    () => toAmountUI(balanceWei, currency.decimals),
    [balanceWei, currency.decimals],
  );
  const { data: usdPrice, isLoading } = useUSDPrice({
    amount: balanceRaw,
    disabled: BN(balanceRaw || "0").lte(0),
    token: currency.address,
  });
  const balance = formatDecimals(balanceRaw || "0", 18);
  const usd = formatDecimals(usdPrice.toString(), 2);

  return (
    <button
      className="mb-2 flex h-[66px] w-full items-center justify-between rounded-[7px] border border-[#e3e5eb] bg-white px-4 text-left transition-[background-color,border-color,box-shadow] hover:border-[#4564ff] hover:bg-[#fbfcff] hover:shadow-[0_0_0_1px_rgba(69,100,255,0.12)] focus-visible:border-[#4564ff] focus-visible:bg-[#fbfcff] focus-visible:shadow-[0_0_0_1px_rgba(69,100,255,0.12)] focus-visible:outline-none"
      onClick={() => onSelect(currency)}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2">
        <CurrencyLogo currency={currency} className="size-6" />
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-[14px] font-bold leading-5 text-[#3f4361]">
            {currency.symbol}
          </p>
        </div>
      </div>
      <p className="truncate text-right text-[13px] font-bold leading-5 text-[#3f4361]">
        {balance} {currency.symbol}{" "}
        <span className="font-semibold text-[#777b92]">
          (≈ ${isLoading ? "..." : usd})
        </span>
      </p>
    </button>
  );
};

const UtilaPercentageButtons = ({
  currency,
  disabled: disabledAll,
}: {
  currency?: Currency;
  disabled?: boolean;
}) => {
  const { setInputAmount } = useActionHandlers();
  const { ui: balance } = useBalance(currency);
  const isNativeFromToken = isNativeAddress(currency?.address);

  const onPercentageClick = useCallback(
    (percentage: number) => {
      if (
        BN(balance || "0")
          .decimalPlaces(7)
          .lte(0)
      ) {
        setInputAmount("");
        return;
      }

      setInputAmount(
        formatDecimals(BN(balance).times(percentage).toString(), 8),
      );
    },
    [balance, setInputAmount],
  );

  return (
    <div className="mt-3 flex justify-start gap-[7.5px]">
      {[0.2, 0.5, 1].map((percentage) => {
        const disabled = disabledAll || (isNativeFromToken && percentage === 1);
        const button = (
          <button
            className={cn(
              "h-[18px] cursor-pointer rounded-[8px] border border-[#e7e8eb] bg-[#f8f8f9] px-0 text-[10px] font-normal leading-3 text-[#3f4361] transition-colors hover:border-[#4a60ff] hover:bg-[#4a60ff] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#e7e8eb] disabled:hover:bg-[#f8f8f9] disabled:hover:text-[#3f4361]",
              percentage === 1 ? "w-[42px]" : "w-[37px]",
              disabled && "pointer-events-none",
            )}
            disabled={disabled}
            onClick={() => onPercentageClick(percentage)}
            type="button"
          >
            {percentage * 100}%
          </button>
        );

        if (!disabled || disabledAll || percentage !== 1) {
          return <React.Fragment key={percentage}>{button}</React.Fragment>;
        }

        return (
          <Tooltip key={percentage}>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-not-allowed">{button}</span>
            </TooltipTrigger>
            <TooltipContent
              arrowClassName="bg-[#303030] fill-[#303030]"
              className="bg-[#303030] text-white"
              side="top"
              sideOffset={6}
            >
              Using max is disallowed for native tokens due to gas fees
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};

export const UtilaTokenPanel = ({ isSrcToken }: { isSrcToken: boolean }) => {
  const { inputCurrency, outputCurrency, inputAmount } = useDerivedSwap();

  const { value: dstAmount, isLoading } = useSpot().dstTokenPanel;
  const { handleCurrencyChange, setInputAmount } = useActionHandlers();
  const { address } = useActiveConnection();
  const hasConnectedWallet = Boolean(address);
  const hasInputToken = Boolean(inputCurrency);
  const canSelectToken = isSrcToken
    ? hasConnectedWallet
    : hasConnectedWallet && hasInputToken;
  const currency =
    canSelectToken && (isSrcToken || hasInputToken)
      ? isSrcToken
        ? inputCurrency
        : outputCurrency
      : undefined;
  const amount = isSrcToken ? inputAmount : formatDecimals(dstAmount, 6);
  const displayAmount = hasConnectedWallet && currency ? amount : "";
  const { ui: balanceRaw } = useBalance(currency);
  const { formatted: usdPrice } = useUSDPrice({
    amount,
    disabled: !currency || BN(amount || "0").lte(0),
    token: currency?.address,
  });
  const { data: balanceUsd, isLoading: isBalanceUsdLoading } = useUSDPrice({
    amount: balanceRaw,
    disabled: !currency || BN(balanceRaw || "0").lte(0),
    token: currency?.address,
  });
  const balanceText = formatDecimals(balanceRaw || "0", 18);
  const balanceUsdText = formatDecimals(balanceUsd.toString(), 2);
  const onTokenChange = useCallback(
    (currencyId: string) => {
      const field = isSrcToken ? Field.INPUT : Field.OUTPUT;

      handleCurrencyChange(currencyId, field);
    },
    [handleCurrencyChange, isSrcToken],
  );

  if (!isSrcToken) {
    return (
      <UtilaCard className="border-0 bg-[#f8f8f9]">
        <p className="mb-3 text-[14px] font-normal leading-4 text-[#3f4361]">
          To
        </p>
        <div className="flex h-[38px] items-center justify-between gap-2">
          <NumericInput
            ariaLabel="To amount"
            className="h-8 min-w-0 flex-1 bg-transparent p-0 text-[24px] font-medium leading-8 text-[#3f4361] placeholder:text-[#b5b8c5]"
            disabled
            isLoading={isLoading}
            onChange={() => {}}
            value={displayAmount}
          />
          <UtilaTokenSelector
            currencyId={currency?.address}
            disabled={!canSelectToken}
            onChange={onTokenChange}
          />
        </div>
        <p className="mt-1 text-[14px] font-normal leading-4 text-[#717389]">
          {BN(displayAmount || "0").gt(0) ? `~$${usdPrice}` : "~$0"}
        </p>
      </UtilaCard>
    );
  }

  return (
    <UtilaCard>
      <div className="mb-3 flex h-4 items-center justify-between gap-4">
        <p className="text-[14px] font-normal leading-4 text-[#3f4361]">From</p>
        {currency && isSrcToken && (
          <p className="truncate text-right text-[12px] font-normal leading-4 text-[#3f4361]">
            <span className="text-[#717389]">Balance:</span> {balanceText}{" "}
            {currency.symbol}{" "}
            <span className="text-[#717389]">
              (≈ ${isBalanceUsdLoading ? "..." : balanceUsdText || "0"})
            </span>
          </p>
        )}
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 pt-[19px]">
          <NumericInput
            ariaLabel={isSrcToken ? "From amount" : "To amount"}
            className="h-8 w-full bg-transparent p-0 text-[24px] font-medium leading-8 text-[#b5b8c5] placeholder:text-[#b5b8c5]"
            disabled={!isSrcToken}
            isLoading={!isSrcToken && isLoading}
            onChange={isSrcToken ? setInputAmount : () => {}}
            value={displayAmount}
          />
          <p className="mt-[22px] text-[14px] font-normal leading-4 text-[#717389]">
            {BN(displayAmount || "0").gt(0) ? `~$${usdPrice}` : "~$0"}
          </p>
        </div>
        <div className="w-[135px] shrink-0">
          <UtilaTokenSelector
            currencyId={currency?.address}
            disabled={!canSelectToken}
            onlyWithBalance={isSrcToken}
            onChange={onTokenChange}
          />
          {isSrcToken && (
            <UtilaPercentageButtons
              currency={currency}
              disabled={!hasConnectedWallet || !currency}
            />
          )}
        </div>
      </div>
    </UtilaCard>
  );
};

export const UtilaToggleCurrencies = () => {
  const { handleToggleCurrencies } = useActionHandlers();

  return (
    <div className="relative z-10 -my-5 flex justify-center">
      <button
        className="flex size-12 cursor-pointer items-center justify-center rounded-[14px] border-4 border-white bg-[#f7f7f9] text-black transition-colors hover:bg-[#ededf1]"
        onClick={handleToggleCurrencies}
        type="button"
      >
        <ArrowDownIcon className="size-6" />
      </button>
    </div>
  );
};

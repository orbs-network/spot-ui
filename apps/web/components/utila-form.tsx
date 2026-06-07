"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import BN from "bignumber.js";
import {
  DISCLAIMER_URL,
  Module,
  ORBS_TWAP_FAQ_URL,
  SPOT_VERSION,
  SwapStatus as SpotSwapStatus,
  useSpot,
} from "@orbs-network/spot-react";
import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import { getNetwork } from "@orbs-network/spot-ui";
import { SwapStatus as HubSwapStatus } from "@orbs-network/swap-ui";
import { WalletButton } from "@rainbow-me/rainbowkit";
import { Virtuoso } from "react-virtuoso";
import {
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ChevronDownIcon,
  ClockIcon,
  InfoIcon,
  SearchIcon,
  ShieldIcon,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SubmitOrderPanel } from "@/components/spot/submit-order-panel";
import {
  SPOT_DURATION_OPTIONS,
  useSpotUiContext,
} from "@/components/spot/spot-ui-provider";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useBalance, useBalances } from "@/lib/hooks/use-balances";
import { useCurrencies, useCurrency } from "@/lib/hooks/use-currencies";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useBestTradeSwapStore } from "@/lib/hooks/store";
import { useSwapBestTrade } from "@/lib/hooks/use-swap-best-trade";
import { useSettings } from "@/lib/hooks/use-settings";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { useActiveConnection } from "@/lib/hooks/use-active-connection";
import { useUtilaConnectRetry } from "@/lib/hooks/use-utila-connect-retry";
import { useUSDPrice } from "@/lib/hooks/use-usd-price";
import { useTranslations } from "@/lib/use-translations";
import { DEFAULT_PRICE_PROTECTION } from "@/lib/consts";
import { Currency, Field, SwapStep, SwapType } from "@/lib/types";
import {
  cn,
  formatDecimals,
  getExplorerUrl,
  getOrderTitle,
  isNativeAddress,
  toAmountUI,
} from "@/lib/utils";
import { Spinner } from "./ui/spinner";
import { zeroAddress } from "viem";

const SLIPPAGE_OPTIONS = [1, 3, 5, 7, 10];
const SWAP_SLIPPAGE_OPTIONS = [0.1, 0.3, 0.5, 0.7, 1];
const DEFAULT_SWAP_SLIPPAGE = 0.5;
const PRICE_PROTECTION_TOOLTIP =
  "The protocol uses an oracle price to help protect users from unfavorable executions. If the execution price is worse than the oracle price by more than the allowed percentage, the transaction will not be executed.";
const QUOTE_FEE_USD_KEYS = [
  "protocolFeeUsd",
  "protocolFeesUsd",
  "feeUsd",
  "feesUsd",
  "partnerFeeUsd",
  "integratorFeeUsd",
] as const;

const UTILA_SPOT_TABS = [
  { label: "Swap", value: SwapType.SWAP },
  { label: "TWAP", value: SwapType.TWAP },
  { label: "Limit", value: SwapType.LIMIT },
  { label: "Stop Loss", value: SwapType.STOP_LOSS },
  { label: "Take Profit", value: SwapType.TAKE_PROFIT },
] as const;

const getQuoteField = (quote: Quote | undefined, keys: readonly string[]) => {
  if (!quote) return "";

  const record = quote as Quote & Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value.toString();
    }

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
};

const useQuoteAgeLabel = (timestamp?: number) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timestamp) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(interval);
  }, [timestamp]);

  if (!timestamp) return "0s";

  return `${Math.max(0, Math.floor((now - timestamp) / 1_000))}s`;
};

const UtilaNotice = () => {
  return (
    <div className="border-b border-[#ebecef] bg-[#f6f6f8]">
      <div className="mx-auto flex h-12 max-w-[1920px] items-center gap-2 px-8 text-[14px] font-medium text-[#70748d]">
        <ShieldIcon className="size-4 text-[#4f5676]" />
        <span>
          Swap and bridge functionality is powered by third-party providers,
          such as Liquidity Hub...
        </span>
        <a
          className="font-semibold text-[#3f4361] hover:text-[#4564ff]"
          href="https://li.fi/"
          rel="noreferrer"
          target="_blank"
        >
          Read more
        </a>
      </div>
    </div>
  );
};

const UtilaTabs = ({
  value,
  onChange,
}: {
  value: SwapType;
  onChange: (value: SwapType) => void;
}) => {
  return (
    <div className="grid grid-cols-5 gap-1 rounded-[10px] border border-[#ececf2] bg-[#f8f8fa] p-1">
      {UTILA_SPOT_TABS.map((tab) => {
        const active = tab.value === value;

        return (
          <button
            className={cn(
              "h-7 min-w-0 cursor-pointer truncate whitespace-nowrap rounded-[8px] border border-transparent px-1.5 text-[12px] font-semibold text-[#747891] transition-colors",
              active
                ? "border-[#e1e3eb] bg-white text-[#3f4361] shadow-[0_2px_8px_rgba(40,48,90,0.08)]"
                : "hover:bg-white hover:text-[#3f4361]",
            )}
            key={tab.value}
            onClick={() => onChange(tab.value)}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

const UtilaCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-[#e7e8eb] bg-white p-4",
        className,
      )}
    >
      {children}
    </div>
  );
};

const UtilaPanelLabel = ({
  title,
  tooltip,
}: {
  title: string;
  tooltip?: string;
}) => {
  return (
    <div className="flex items-center gap-2">
      <p className="text-[15px] font-semibold text-[#3f4361]">{title}</p>
      {tooltip && (
        <span className="group relative flex">
          <InfoIcon className="size-4 text-[#85899d]" />
          <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-[220px] -translate-x-1/2 rounded-md bg-[#30344a] px-2 py-1 text-xs font-medium text-white group-hover:block">
            {tooltip}
          </span>
        </span>
      )}
    </div>
  );
};

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
  const { data: balances, isLoading: isBalancesLoading } = useBalances({
    disabled: tokenListDisabled,
  });
  const selectableCurrencies = useMemo(() => {
    if (!onlyWithBalance) return currencies;

    return currencies.filter((item) =>
      BN(balances?.[item.address] || "0").gt(0),
    );
  }, [balances, currencies, onlyWithBalance]);
  const isTokenListLoading =
    isLoading || (onlyWithBalance && isBalancesLoading);
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

const UtilaTokenPanel = ({ isSrcToken }: { isSrcToken: boolean }) => {
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

const UtilaToggleCurrencies = () => {
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

const UtilaPriceInput = ({
  symbol,
  value,
  onChange,
  percentage,
  onPercentageChange,
  isLoading,
  usd,
}: {
  symbol?: string;
  value: string;
  onChange: (value: string) => void;
  percentage: string;
  onPercentageChange: (value: string) => void;
  isLoading?: boolean;
  usd?: string;
}) => {
  const usdFormatted = formatDecimals(usd, 2);

  return (
    <div className="grid grid-cols-[1fr_112px] gap-2">
      <div className="flex min-h-12 items-center gap-3 rounded-[8px] border border-[#ececf2] bg-white px-3">
        <p className="text-[14px] font-semibold text-[#777b92]">{symbol}</p>
        <div className="flex flex-1 flex-col items-end">
          <NumericInput
            className="w-full bg-transparent text-right text-[18px] font-semibold text-[#3f4361]"
            isLoading={isLoading}
            onChange={onChange}
            value={value}
          />
          {usd && (
            <p className="text-[12px] font-medium text-[#777b92]">
              ${usdFormatted}
            </p>
          )}
        </div>
      </div>
      <div className="flex min-h-12 items-center rounded-[8px] border border-[#ececf2] bg-white px-3">
        <NumericInput
          allowNegative
          className="w-full bg-transparent text-center text-[18px] font-semibold text-[#3f4361]"
          onChange={onPercentageChange}
          suffix="%"
          value={percentage}
        />
      </div>
    </div>
  );
};

const UtilaLimitPricePanel = () => {
  const t = useTranslations();
  const { swapModule } = useSpotUiContext();
  const {
    invertedDstToken,
    isLimitPrice,
    isLoading,
    isTypedValue,
    onInputChange,
    onPercentageChange,
    onReset,
    percentage,
    priceUI,
    toggleLimitPrice,
    usd,
  } = useSpot().limitPricePanel;

  if (Number(SPOT_VERSION) < 2 && swapModule === Module.TAKE_PROFIT) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {swapModule !== Module.LIMIT && (
          <Switch checked={isLimitPrice} onCheckedChange={toggleLimitPrice} />
        )}
        <div className="flex flex-1 items-center justify-between">
          <UtilaPanelLabel
            title={t("limitPrice")}
            tooltip={t("limitPriceTooltip")}
          />
          {isLimitPrice && (
            <button
              className="text-[13px] font-semibold text-[#4564ff]"
              onClick={onReset}
              type="button"
            >
              Set to default
            </button>
          )}
        </div>
      </div>
      {isLimitPrice && (
        <UtilaPriceInput
          isLoading={isLoading}
          onChange={onInputChange}
          onPercentageChange={onPercentageChange}
          percentage={percentage}
          symbol={invertedDstToken?.symbol}
          usd={usd}
          value={isTypedValue ? priceUI : formatDecimals(priceUI, 6)}
        />
      )}
    </div>
  );
};

const UtilaTriggerPricePanel = () => {
  const t = useTranslations();
  const { swapModule } = useSpotUiContext();
  const {
    invertedDstToken,
    isTypedValue,
    onInputChange,
    onPercentageChange,
    onReset,
    percentage,
    priceUI,
    usd,
  } = useSpot().triggerPricePanel;

  if (swapModule !== Module.TAKE_PROFIT && swapModule !== Module.STOP_LOSS) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <UtilaPanelLabel
          title={t("stopLossLabel")}
          tooltip={t(
            swapModule === Module.STOP_LOSS
              ? "stopLossTooltip"
              : "takeProfitTooltip",
          )}
        />
        <button
          className="text-[13px] font-semibold text-[#4564ff]"
          onClick={onReset}
          type="button"
        >
          Set to default
        </button>
      </div>
      <UtilaPriceInput
        onChange={onInputChange}
        onPercentageChange={onPercentageChange}
        percentage={percentage}
        symbol={invertedDstToken?.symbol}
        usd={usd}
        value={isTypedValue ? priceUI : formatDecimals(priceUI, 6)}
      />
    </div>
  );
};

const UtilaPrices = () => {
  const { fromToken, isInverted, isMarketPrice, onInvert } =
    useSpot().pricePanel;

  return (
    <UtilaCard className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-[#777b92]">
          {isInverted ? "Buy " : "Sell "}
          {fromToken?.symbol} {isMarketPrice ? "at best rate" : "at rate"}
        </p>
        {!isMarketPrice && (
          <button
            className="flex size-8 items-center justify-center rounded-[8px] bg-white text-[#3f4361] ring-1 ring-[#e3e5eb]"
            onClick={onInvert}
            type="button"
          >
            <ArrowLeftRightIcon className="size-4" />
          </button>
        )}
      </div>
      <UtilaTriggerPricePanel />
      <UtilaLimitPricePanel />
    </UtilaCard>
  );
};

const UtilaNumberCard = ({
  children,
  error,
  title,
  tooltip,
}: {
  children: React.ReactNode;
  error?: boolean;
  title: string;
  tooltip?: string;
}) => {
  return (
    <UtilaCard className={cn(error && "border-[#f04438]")}>
      <div className="flex flex-col gap-3">
        <UtilaPanelLabel title={title} tooltip={tooltip} />
        {children}
      </div>
    </UtilaCard>
  );
};

const UtilaSelect = ({
  onChange,
  value,
}: {
  value: number;
  onChange: (value: number) => void;
}) => {
  return (
    <Select onValueChange={(next) => onChange(Number(next))} value={`${value}`}>
      <SelectTrigger className="h-auto min-h-11 w-[150px] self-stretch rounded-[8px] border-[#e3e5eb] bg-white text-[14px] font-semibold text-[#3f4361] shadow-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-[#e3e5eb] bg-white text-[#3f4361]">
        {SPOT_DURATION_OPTIONS.map((item) => (
          <SelectItem key={item.value} value={`${item.value}`}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const UtilaDurationPanel = () => {
  const t = useTranslations();
  const { duration, onInputChange, onUnitSelect } = useSpot().durationPanel;

  return (
    <UtilaNumberCard title={t("expiry")} tooltip={t("maxDurationTooltip")}>
      <div className="flex items-stretch gap-2">
        <NumericInput
          className="h-11 flex-1 rounded-[8px] border border-[#e3e5eb] bg-white px-3 text-[18px] font-semibold text-[#3f4361]"
          onChange={onInputChange}
          value={duration.value ? duration.value.toString() : ""}
        />
        <UtilaSelect onChange={onUnitSelect} value={duration.unit} />
      </div>
    </UtilaNumberCard>
  );
};

const UtilaFillDelayPanel = () => {
  const t = useTranslations();
  const { fillDelay, onInputChange, onUnitSelect } = useSpot().fillDelayPanel;

  return (
    <UtilaNumberCard
      title={t("tradeIntervalTitle")}
      tooltip={t("tradeIntervalTooltip")}
    >
      <div className="flex items-stretch gap-2">
        <NumericInput
          className="h-11 flex-1 rounded-[8px] border border-[#e3e5eb] bg-white px-3 text-[18px] font-semibold text-[#3f4361]"
          onChange={onInputChange}
          value={fillDelay.value ? fillDelay.value.toString() : ""}
        />
        <UtilaSelect onChange={onUnitSelect} value={fillDelay.unit} />
      </div>
    </UtilaNumberCard>
  );
};

const UtilaTradesPanel = () => {
  const t = useTranslations();
  const { amountPerTradeUI, amountPerTradeUsd, error, onChange, totalTrades } =
    useSpot().tradesAmountPanel;
  const { srcToken } = useSpot().derivedFormData;
  const amountPerChunk = formatDecimals(amountPerTradeUI, 6);
  const amountPerChunkUsd = formatDecimals(amountPerTradeUsd, 3);

  return (
    <UtilaNumberCard
      error={Boolean(error)}
      title={t("tradesAmountTitle")}
      tooltip={t("totalTradesTooltip")}
    >
      <div className="flex items-center gap-2">
        <NumericInput
          className="h-11 flex-1 rounded-[8px] border border-[#e3e5eb] bg-white px-3 text-[18px] font-semibold text-[#3f4361]"
          onChange={(next) => onChange(Number(next))}
          value={totalTrades ? totalTrades.toString() : ""}
        />
        <p className="w-[76px] text-[14px] font-semibold text-[#777b92]">
          Trades
        </p>
      </div>
      {srcToken && totalTrades > 1 && (
        <p className="text-[13px] font-medium text-[#777b92]">
          {amountPerChunk} {srcToken.symbol} per trade{" "}
          {amountPerChunkUsd && <span>(~${amountPerChunkUsd})</span>}
        </p>
      )}
    </UtilaNumberCard>
  );
};

const UtilaModuleInputs = () => {
  const { swapModule } = useSpotUiContext();

  if (swapModule === Module.TWAP) {
    return (
      <>
        <UtilaTradesPanel />
        <UtilaFillDelayPanel />
      </>
    );
  }

  return <UtilaDurationPanel />;
};

const UtilaProtectionPanel = ({ isSwap }: { isSwap: boolean }) => {
  const { priceProtection, setPriceProtection, slippage, setSlippage } =
    useSettings();
  const [customMode, setCustomMode] = useState(false);
  const options = isSwap ? SWAP_SLIPPAGE_OPTIONS : SLIPPAGE_OPTIONS;
  const value = isSwap ? slippage : priceProtection;
  const setValue = isSwap ? setSlippage : setPriceProtection;

  useEffect(() => {
    if (!isSwap || customMode || options.includes(slippage)) {
      return;
    }

    setSlippage(DEFAULT_SWAP_SLIPPAGE);
  }, [customMode, isSwap, options, setSlippage, slippage]);

  useEffect(() => {
    if (isSwap) {
      return;
    }

    setPriceProtection(DEFAULT_PRICE_PROTECTION);
  }, [isSwap, setPriceProtection]);

  return (
    <div className="flex flex-col gap-3 mt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-[14px] font-normal text-[#717389]">
            {isSwap ? "Slippage tolerance" : "Price protection"}
          </p>
          {!isSwap && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="inline-flex size-4 cursor-help items-center justify-center text-[#717389]"
                  type="button"
                >
                  <InfoIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                arrowClassName="bg-[#303030] fill-[#303030]"
                className="max-w-[330px] bg-[#303030] text-white"
                side="top"
                sideOffset={6}
              >
                {PRICE_PROTECTION_TOOLTIP}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <button
          className="cursor-pointer text-[12px] font-normal leading-4 text-[#4a60ff]"
          onClick={() => setCustomMode((current) => !current)}
          type="button"
        >
          {customMode ? "Use preset" : "Custom"}
        </button>
      </div>
      <div className="h-10">
        {customMode ? (
          <div className="flex h-full items-center rounded-[7px] border border-[#4a60ff] px-4">
            <NumericInput
              className="h-full flex-1 bg-transparent text-[14px] font-normal text-[#3f4361]"
              onChange={(nextValue) => setValue(Number(nextValue))}
              value={value ? value.toString() : ""}
            />
            <span className="text-[14px] font-normal text-[#3f4361]">%</span>
          </div>
        ) : (
          <div className="grid h-full grid-cols-5 gap-[7.5px]">
            {options.map((option) => (
              <button
                className={cn(
                  "h-full cursor-pointer rounded-[8px] border border-[#e7e8eb] bg-transparent text-[14px] font-normal text-[#3f4361] transition-colors",
                  option === value && "border-[#4a60ff] bg-[#edefff]",
                )}
                key={option}
                onClick={() => setValue(option)}
                type="button"
              >
                {option}%
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const UtilaAvailableQuotesPanel = () => {
  const {
    inputCurrency,
    outputCurrency,
    parsedInputAmount,
    trade,
  } = useDerivedSwap();
  const { chainId } = useSwapParams();
  const quote = trade?.originalQuote as Quote | undefined;
  const network = getNetwork(chainId);
  const native = network?.native;
  const nativeCurrency = useMemo((): Currency | undefined => {
    if (!native) return undefined;

    return {
      address: zeroAddress,
      decimals: native.decimals,
      logoUrl: native.logoUrl,
      name: native.symbol,
      symbol: native.symbol,
    };
  }, [native]);
  const quoteAge = useQuoteAgeLabel(quote?.timestamp);
  const inputAmount = toAmountUI(parsedInputAmount, inputCurrency?.decimals);
  const outputAmount = toAmountUI(trade?.outAmount, outputCurrency?.decimals);
  const rate =
    BN(inputAmount || "0").gt(0) && BN(outputAmount || "0").gt(0)
      ? BN(outputAmount).div(inputAmount).toString()
      : "";
  const rateUsd = useUSDPrice({
    amount: rate,
    disabled: !outputCurrency || !rate || BN(rate || "0").lte(0),
    token: outputCurrency?.address,
  });
  const protocolFeeUsd = getQuoteField(quote, QUOTE_FEE_USD_KEYS);
  const networkFeeAmount = toAmountUI(
    quote?.gasAmountOut ?? trade?.gas,
    nativeCurrency?.decimals,
  );
  const networkFeeUsd = useUSDPrice({
    amount: networkFeeAmount,
    disabled:
      !nativeCurrency || !networkFeeAmount || BN(networkFeeAmount || "0").lte(0),
    token: nativeCurrency?.address,
  });
  const showNetworkFee =
    Boolean(nativeCurrency) && BN(networkFeeAmount || "0").gt(0);

  if (!quote || !inputCurrency || !outputCurrency || !rate) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[14px] font-normal text-[#717389]">
        Available Quotes
      </h3>
      <div className="rounded-[10px] border border-[#4a60ff] bg-[#eff1ff] p-3 text-[#3f4361] shadow-[0_12px_24px_rgba(74,96,255,0.12)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center">
            <span className="min-w-0 truncate text-[14px] font-semibold leading-5 text-[#3f4361]">
              Liquidity Hub
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[#3f4361]">
            <ClockIcon className="size-3.5 fill-[#3f4361] text-[#3f4361]" />
            <span>{quoteAge}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 text-[13px] leading-5">
          <p className="break-words font-normal">
            <span className="font-bold">Rate:</span>{" "}
            1 {inputCurrency.symbol} = {formatDecimals(rate, 18)}{" "}
            {outputCurrency.symbol}
            {rateUsd.formatted && <span> (~${rateUsd.formatted})</span>}
          </p>
          {protocolFeeUsd && (
            <p className="font-normal">
              <span className="font-bold">Protocol fees:</span> ≈ $
              {formatDecimals(protocolFeeUsd, 2)}
            </p>
          )}
          {showNetworkFee && (
            <p className="flex flex-wrap items-center gap-1.5 font-normal">
              <span className="font-bold">Estimated network fee:</span>
              <CurrencyLogo className="size-4" currency={nativeCurrency} />
              <span className="font-bold">
                {formatDecimals(networkFeeAmount, 18)} {nativeCurrency?.symbol}
              </span>
              {networkFeeUsd.formatted && (
                <span className="text-[#70748d]">
                  (≈ ${networkFeeUsd.formatted})
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const UtilaInputError = () => {
  const t = useTranslations();
  const error = useSpot().inputError;

  if (!error) return null;

  return (
    <div className="flex h-8 items-center gap-2 rounded-[6px] bg-[#fee8ea] px-3 text-[#3f4361]">
      <span className="flex size-3 shrink-0 items-center justify-center rounded-full bg-[#f0445a] text-[9px] font-bold leading-none text-white">
        !
      </span>
      <p className="flex-1 text-[14px] font-normal leading-4">
        {t(error.type, error.args)}
      </p>
    </div>
  );
};

const UtilaDisclaimer = () => {
  const t = useTranslations();
  const disclaimer = useSpot().disclaimerPanel;

  if (!disclaimer) return null;

  return (
    <div className="flex gap-2 rounded-[8px] bg-[#f8f8fa] p-3 text-[#70748d]">
      <InfoIcon className="relative top-0.5 size-4" />
      <p className="flex-1 text-[13px] font-medium">
        {t(disclaimer)}{" "}
        <a
          className="font-semibold text-[#4564ff]"
          href={ORBS_TWAP_FAQ_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Learn more
        </a>
      </p>
    </div>
  );
};

const UtilaSubmitError = ({
  code,
  message,
  onClose,
}: {
  code: number;
  message: string;
  onClose: () => void;
}) => {
  const { envMode } = useSwapParams();

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[8px] bg-[#fff1f0] p-3 text-[#b42318]">
        <p className="text-[14px] font-semibold">Error code: {code}</p>
        {envMode === "dev" && (
          <p className="mt-2 max-h-[200px] overflow-y-auto text-[13px] font-medium">
            {message}
          </p>
        )}
      </div>
      <button
        className="h-10 rounded-[8px] bg-[#4564ff] text-[15px] font-semibold text-white"
        onClick={onClose}
        type="button"
      >
        Close
      </button>
    </div>
  );
};

const UtilaSubmitMain = ({
  orderTitle,
  onSubmit,
  swapLoading,
}: {
  orderTitle: string;
  onSubmit: () => void;
  swapLoading: boolean;
}) => {
  const [disclaimerAccept, setDisclaimerAccept] = useState(true);

  return (
    <SubmitOrderPanel
      orderTitle={orderTitle}
      reviewDetails={
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] font-medium text-[#3f4361]">
              Accept{" "}
              <a
                className="font-semibold text-[#4564ff]"
                href={DISCLAIMER_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                Disclaimer
              </a>
            </p>
            <Switch
              checked={disclaimerAccept}
              onCheckedChange={setDisclaimerAccept}
            />
          </div>
          <button
            className="flex h-11 w-full items-center justify-center rounded-[8px] bg-[#4564ff] text-[16px] font-semibold text-white disabled:bg-[#c9ccd6]"
            disabled={!disclaimerAccept || swapLoading}
            onClick={onSubmit}
            type="button"
          >
            {swapLoading ? "Creating..." : "Create Order"}
          </button>
        </>
      }
    />
  );
};

const UtilaSubmitOrder = () => {
  const { setInputAmount } = useActionHandlers();
  const { address } = useActiveConnection();
  const { retryingConnect, startConnectRetry } = useUtilaConnectRetry();
  const { disabled, loading } = useSpot().submitOrderButton;
  const {
    confirmButtonLoading,
    onSubmit,
    parsedError,
    resetCurrentSwap,
    resetState,
    status,
  } = useSpot().orderExecutionPanel;
  const orderTitle = getOrderTitle(useSpot().derivedFormData.orderType);
  const [open, setOpen] = useState(false);
  const buttonText =
    !address
      ? "Connect Wallet"
      : loading
        ? "Fetching quote..."
        : "Place Order";

  const onClose = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) return;

      if (status === SpotSwapStatus.SUCCESS) {
        setInputAmount("");
        setTimeout(resetState, 500);
      } else if (Boolean(status)) {
        setTimeout(resetCurrentSwap, 500);
      }
    },
    [resetCurrentSwap, resetState, setInputAmount, status],
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <WalletButton.Custom wallet="utila">
        {({
          connect,
          loading: connectLoading,
          mounted,
          ready,
        }) => (
          <button
            className="mt-2 flex h-10 w-full items-center justify-center rounded-[8px] bg-[#cfd0d8] px-4 text-[16px] font-normal text-white transition-colors enabled:bg-[#4564ff] enabled:hover:bg-[#3152ff]"
            disabled={
              address
                ? disabled || loading
                : !mounted || !ready || connectLoading || retryingConnect
            }
            onClick={() => {
              if (!address) {
                startConnectRetry(connect);
                return;
              }

              setOpen(true);
            }}
            type="button"
          >
            {!address && (connectLoading || retryingConnect)
              ? "Connecting..."
              : buttonText}
            {((address && loading) ||
              (!address && (connectLoading || retryingConnect))) && (
              <Spinner className="size-4" />
            )}
          </button>
        )}
      </WalletButton.Custom>
      <DialogContent className="max-w-[520px] border-[#e3e5eb] bg-white text-[#3f4361]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-[#3f4361]">
            {parsedError
              ? "Error Creating Order"
              : status
                ? " "
                : `${orderTitle} order`}
          </DialogTitle>
        </DialogHeader>
        {parsedError ? (
          <UtilaSubmitError
            code={parsedError.code}
            message={parsedError.message}
            onClose={() => onClose(false)}
          />
        ) : (
          <UtilaSubmitMain
            onSubmit={onSubmit}
            orderTitle={orderTitle}
            swapLoading={Boolean(confirmButtonLoading)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

const useUtilaSwapButtonState = () => {
  const { address } = useActiveConnection();
  const {
    inputCurrency: inputCurrencyAddress,
    outputCurrency: outputCurrencyAddress,
  } = useSwapParams();
  const inputTokenSelected = Boolean(inputCurrencyAddress);
  const outputTokenSelected = Boolean(outputCurrencyAddress);
  const {
    inputCurrency,
    isLoadingTrade,
    outputCurrency,
    parsedInputAmount,
    trade,
  } = useDerivedSwap();
  const { wei: inputBalance } = useBalance(inputCurrency);
  const hasAmount = BN(parsedInputAmount || "0").gt(0);
  const enterAmount = !hasAmount;
  const insufficientBalance =
    Boolean(inputCurrency) &&
    hasAmount &&
    BN(inputBalance || "0").lt(parsedInputAmount || "0");
  const insufficientLiquidity =
    Boolean(inputCurrency && outputCurrency) &&
    hasAmount &&
    !isLoadingTrade &&
    BN(trade?.outAmount || "0").isZero();
  const missingToken =
    !inputCurrency ||
    !outputCurrency ||
    !inputTokenSelected ||
    !outputTokenSelected;
  const text = useMemo(() => {
    if (!address) return "Connect Wallet";
    if (missingToken) return "Select token";
    if (enterAmount) return "Enter an amount";
    if (isLoadingTrade) return "Fetching quote...";
    if (insufficientBalance) {
      return `Insufficient ${inputCurrency?.symbol || "token"} balance`;
    }
    if (insufficientLiquidity) return "Insufficient liquidity";

    return "Swap";
  }, [
    address,
    enterAmount,
    inputCurrency?.symbol,
    insufficientBalance,
    insufficientLiquidity,
    isLoadingTrade,
    missingToken,
  ]);
  const disabled =
    Boolean(address) &&
    (missingToken ||
      enterAmount ||
      isLoadingTrade ||
      insufficientBalance ||
      insufficientLiquidity);

  return {
    disabled,
    insufficientBalance,
    insufficientLiquidity,
    text,
  };
};

const UtilaSwapValidationError = () => {
  const { inputCurrency } = useDerivedSwap();
  const { insufficientBalance, insufficientLiquidity } =
    useUtilaSwapButtonState();
  const message = insufficientBalance
    ? `Insufficient ${inputCurrency?.symbol || "token"} balance`
    : insufficientLiquidity
      ? "Insufficient liquidity"
      : "";

  if (!message) return null;

  return (
    <div className="flex h-8 items-center gap-2 rounded-[6px] bg-[#fee8ea] px-3 text-[#3f4361]">
      <span className="flex size-3 shrink-0 items-center justify-center rounded-full bg-[#f0445a] text-[9px] font-bold leading-none text-white">
        !
      </span>
      <p className="flex-1 text-[14px] font-normal leading-4">{message}</p>
    </div>
  );
};

const UtilaSwapStepText = ({ status }: { status?: HubSwapStatus }) => {
  const { currentStep } = useBestTradeSwapStore();

  if (status !== HubSwapStatus.LOADING) return null;

  const text =
    currentStep === SwapStep.WRAP
      ? "Wrapping native token"
      : currentStep === SwapStep.APPROVE
        ? "Approving token"
        : currentStep === SwapStep.SWAP
          ? "Submitting swap"
          : "Preparing swap";

  return (
    <p className="text-center text-[13px] font-medium text-[#70748d]">{text}</p>
  );
};

const UtilaSwapSummary = () => {
  const { inputAmount, inputCurrency, outputAmount, outputCurrency } =
    useDerivedSwap();
  const inputUsd = useUSDPrice({
    amount: inputAmount,
    disabled: !inputCurrency || BN(inputAmount || "0").lte(0),
    token: inputCurrency?.address,
  });
  const outputUsd = useUSDPrice({
    amount: outputAmount,
    disabled: !outputCurrency || BN(outputAmount || "0").lte(0),
    token: outputCurrency?.address,
  });

  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-[#e3e5eb] bg-[#fbfbfd] p-3">
      {[
        {
          amount: inputAmount,
          currency: inputCurrency,
          label: "From",
          usd: inputUsd.formatted,
        },
        {
          amount: outputAmount,
          currency: outputCurrency,
          label: "To",
          usd: outputUsd.formatted,
        },
      ].map((row) => (
        <div
          className="flex items-center justify-between gap-4"
          key={row.label}
        >
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[#70748d]">
              {row.label}
            </p>
            <p className="mt-1 truncate text-[15px] font-semibold text-[#3f4361]">
              {formatDecimals(row.amount || "0", 6)} {row.currency?.symbol}
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-[#70748d]">
              ≈ ${row.usd || "0"}
            </p>
          </div>
          <CurrencyLogo className="size-8 shrink-0" currency={row.currency} />
        </div>
      ))}
    </div>
  );
};

const UtilaSwapDetailRow = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="flex min-h-8 items-center justify-between gap-4 border-b border-[#eceef3] py-2 last:border-b-0">
    <p className="text-[13px] font-medium text-[#70748d]">{label}</p>
    <p className="min-w-0 truncate text-right text-[13px] font-semibold text-[#3f4361]">
      {value}
    </p>
  </div>
);

const UtilaSwapDetails = () => {
  const { inputAmount, inputCurrency, outputAmount, outputCurrency, trade } =
    useDerivedSwap();
  const networkCostAmount = toAmountUI(trade?.gas, outputCurrency?.decimals);
  const minimumAmountOut = toAmountUI(
    trade?.minAmountOut,
    outputCurrency?.decimals,
  );
  const networkCostUsd = useUSDPrice({
    amount: networkCostAmount,
    disabled: !outputCurrency || BN(networkCostAmount || "0").lte(0),
    token: outputCurrency?.address,
  });
  const inputUsd = useUSDPrice({
    amount: inputAmount,
    disabled: !inputCurrency || BN(inputAmount || "0").lte(0),
    token: inputCurrency?.address,
  });
  const outputUsd = useUSDPrice({
    amount: outputAmount,
    disabled: !outputCurrency || BN(outputAmount || "0").lte(0),
    token: outputCurrency?.address,
  });
  const rate =
    BN(inputAmount || "0").gt(0) && BN(outputAmount || "0").gt(0)
      ? BN(outputAmount).div(inputAmount).toString()
      : "";
  const priceImpact =
    BN(inputUsd.data || 0).gt(0) && BN(outputUsd.data || 0).gt(0)
      ? BN(100).minus(BN(outputUsd.data).div(inputUsd.data).times(100))
      : undefined;

  if (!trade || !inputCurrency || !outputCurrency) return null;

  return (
    <div className="rounded-[8px] border border-[#e3e5eb] bg-white px-3">
      <UtilaSwapDetailRow
        label="Rate"
        value={
          rate
            ? `1 ${inputCurrency.symbol} = ${formatDecimals(rate, 6)} ${
                outputCurrency.symbol
              }`
            : "-"
        }
      />
      <UtilaSwapDetailRow
        label="Minimum amount out"
        value={`${formatDecimals(minimumAmountOut, 6)} ${outputCurrency.symbol}`}
      />
      <UtilaSwapDetailRow
        label="Network cost"
        value={`$${networkCostUsd.formatted || "0"}`}
      />
      <UtilaSwapDetailRow
        label="Price impact"
        value={
          priceImpact ? `${formatDecimals(priceImpact.toString(), 2)}%` : "-"
        }
      />
    </div>
  );
};

const UtilaSwapSuccess = () => {
  const { txHash } = useSwapBestTrade();
  const { chainId } = useSwapParams();

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[8px] bg-[#eaf8f2] p-4 text-center">
        <p className="text-[16px] font-semibold text-[#249064]">
          Swap completed
        </p>
      </div>
      {txHash && (
        <a
          className="flex h-10 items-center justify-center rounded-[8px] bg-[#4564ff] text-[15px] font-semibold text-white"
          href={getExplorerUrl(chainId, txHash)}
          rel="noopener noreferrer"
          target="_blank"
        >
          View on explorer
        </a>
      )}
    </div>
  );
};

const UtilaSubmitSwap = () => {
  const { setInputAmount } = useActionHandlers();
  const { address } = useActiveConnection();
  const { retryingConnect, startConnectRetry } = useUtilaConnectRetry();
  const { disabled, text } = useUtilaSwapButtonState();
  const { currentStepIndex, onSwapBestTrade, reset, status, totalSteps } =
    useSwapBestTrade();
  const [open, setOpen] = useState(false);

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);

      if (nextOpen) return;

      if (status === HubSwapStatus.SUCCESS) {
        setInputAmount("");
      }

      if (status) {
        setTimeout(reset, 500);
      }
    },
    [reset, setInputAmount, status],
  );
  const onButtonClick = useCallback(() => {
    setOpen(true);
    if (status !== HubSwapStatus.LOADING) {
      reset();
    }
  }, [reset, status]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <WalletButton.Custom wallet="utila">
        {({
          connect,
          loading: connectLoading,
          mounted,
          ready,
        }) => (
          <button
            className="mt-2 flex h-10 w-full items-center justify-center rounded-[8px] bg-[#cfd0d8] px-4 text-[16px] font-normal text-white transition-colors enabled:bg-[#4564ff] enabled:hover:bg-[#3152ff]"
            disabled={
              address
                ? disabled
                : !mounted || !ready || connectLoading || retryingConnect
            }
            onClick={() => {
              if (!address) {
                startConnectRetry(connect);
                return;
              }

              onButtonClick();
            }}
            type="button"
          >
            {!address && (connectLoading || retryingConnect)
              ? "Connecting..."
              : text}
            {(status === HubSwapStatus.LOADING ||
              (!address && (connectLoading || retryingConnect))) && (
              <Spinner className="size-4" />
            )}
          </button>
        )}
      </WalletButton.Custom>
      <DialogContent className="max-w-[520px] border-[#e3e5eb] bg-white text-[#3f4361]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-[#3f4361]">
            {status === HubSwapStatus.SUCCESS
              ? "Swap completed"
              : status === HubSwapStatus.FAILED
                ? "Swap failed"
                : "Review Swap"}
          </DialogTitle>
        </DialogHeader>
        {status === HubSwapStatus.SUCCESS ? (
          <UtilaSwapSuccess />
        ) : status === HubSwapStatus.FAILED ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-[8px] bg-[#fff1f0] p-4 text-center">
              <p className="text-[16px] font-semibold text-[#b42318]">
                Swap failed
              </p>
            </div>
            <button
              className="h-10 rounded-[8px] bg-[#4564ff] text-[15px] font-semibold text-white"
              onClick={() => reset()}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <UtilaSwapSummary />
            <UtilaSwapDetails />
            <UtilaSwapStepText status={status} />
            {status === HubSwapStatus.LOADING && totalSteps ? (
              <p className="text-center text-[12px] font-medium text-[#70748d]">
                Step {(currentStepIndex ?? 0) + 1} of {totalSteps}
              </p>
            ) : null}
            <button
              className="flex h-11 w-full items-center justify-center rounded-[8px] bg-[#4564ff] text-[16px] font-semibold text-white disabled:bg-[#c9ccd6]"
              disabled={status === HubSwapStatus.LOADING}
              onClick={() => onSwapBestTrade()}
              type="button"
            >
              {status === HubSwapStatus.LOADING
                ? "Swapping..."
                : "Confirm Swap"}
              {status === HubSwapStatus.LOADING && (
                <Spinner className="size-4" />
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const UtilaSpotForm = ({ swapType }: { swapType: SwapType }) => {
  const isSwap = swapType === SwapType.SWAP;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <UtilaTokenPanel isSrcToken />
        <UtilaToggleCurrencies />
        <UtilaTokenPanel isSrcToken={false} />
      </div>
      {!isSwap && (
        <>
          <UtilaPrices />
          <UtilaModuleInputs />
        </>
      )}
      <UtilaProtectionPanel isSwap={isSwap} />
      {isSwap && <UtilaAvailableQuotesPanel />}
      {isSwap ? (
        <>
          <UtilaSwapValidationError />
          <UtilaSubmitSwap />
        </>
      ) : (
        <>
          <UtilaInputError />
          <UtilaSubmitOrder />
          <UtilaDisclaimer />
        </>
      )}
    </div>
  );
};

export function UtilaForm() {
  const { handleSwapTypeChange } = useActionHandlers();
  const { swapType: querySwapType } = useSwapParams();
  const hasClearedInitialCurrenciesRef = useRef(false);
  const [swapType, setSwapType] = useState<SwapType>(() =>
    UTILA_SPOT_TABS.some((tab) => tab.value === querySwapType)
      ? querySwapType
      : SwapType.SWAP,
  );

  useEffect(() => {
    document.body.classList.remove("dark");
    document.body.classList.add("utila-mode");

    return () => {
      document.body.classList.remove("utila-mode");
      document.body.classList.add("dark");
    };
  }, []);

  useEffect(() => {
    if (hasClearedInitialCurrenciesRef.current) return;

    hasClearedInitialCurrenciesRef.current = true;
    const url = new URL(window.location.href);

    url.searchParams.delete("inputCurrency");
    url.searchParams.delete("outputCurrency");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  const onTabChange = useCallback(
    (next: SwapType) => {
      setSwapType(next);
      handleSwapTypeChange(next);
    },
    [handleSwapTypeChange],
  );

  return (
    <main className="ml-[230px] min-h-[calc(100vh-64px)] w-[calc(100vw-230px)] bg-white text-[#3f4361]">
      <UtilaNotice />
      <section className="mx-auto flex w-full max-w-[1200px] justify-center px-6">
        <div className="mt-6 mb-20 flex w-full max-w-[630px] flex-col gap-4">
          <UtilaTabs onChange={onTabChange} value={swapType} />
          <UtilaSpotForm swapType={swapType} />
        </div>
      </section>
    </main>
  );
}

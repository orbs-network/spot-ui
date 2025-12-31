/* eslint-disable @next/next/no-img-element */
import React, { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { PlusIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Virtuoso } from "react-virtuoso";
import { Currency } from "@/lib/types";
import { useBalance } from "@/lib/hooks/use-balances";
import { useFormatNumber } from "@/lib/hooks/common";
import { useUSDPrice } from "@/lib/hooks/use-usd-price";
import BN from "bignumber.js";
import { useConnection } from "wagmi";
import {
  filterCurrencies,
  getPopularTokenForChain,
  isNativeAddress,
  makeElipsisAddress,
} from "@/lib/utils";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { AvatarImage } from "@radix-ui/react-avatar";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { useCurrencies } from "@/lib/hooks/use-currencies";
import { CurrencyLogo } from "./ui/currency-logo";
import { useUserStore } from "@/lib/hooks/store";

type Props = {
  onCurrencyChange: (currency: Currency) => void;
  trigger?: React.ReactNode;
};

const PopularTokens = ({
  onCurrencyChange,
}: {
  onCurrencyChange: (currency: Currency) => void;
}) => {
  const { chainId } = useConnection();
  const { currencies } = useCurrencies();
  const popularTokens = getPopularTokenForChain(chainId);

  const popularCurrencies = useMemo(() => {
    if (!popularTokens.length) return [];
    return filterCurrencies(
      currencies,
      popularTokens.map((t) => t.toLowerCase())
    );
  }, [currencies, popularTokens]);

  return (
    <div className="grid grid-cols-5 gap-2 px-3">
      {popularCurrencies.map((c) => (
        <DialogClose key={c.address}>
          <div
            className="flex flex-col items-center gap-1 rounded-xl p-3 bg-accent cursor-pointer hover:bg-accent/80"
            onClick={() => onCurrencyChange(c)}
          >
            <Avatar className="size-6">
              <AvatarImage src={c.logoUrl} />
              <AvatarFallback>
                <Skeleton className="size-6" />
              </AvatarFallback>
            </Avatar>
            <p className="text-[11px] font-semibold text-ellipsis whitespace-nowrap overflow-hidden max-w-[50px] cursor-pointer">
              {c.symbol}
            </p>
          </div>
        </DialogClose>
      ))}
    </div>
  );
};

const SearchInput = ({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) => {
  return (
    <div className="p-3">
      <Input
        type="text"
        placeholder="Search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

const Loader = () => {
  return (
    <div className="flex flex-col gap-5 p-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 justify-start">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="w-[50px] h-4" />
            <Skeleton className="w-[150px] h-4" />
          </div>
        </div>
      ))}
    </div>
  );
};

export function CurrencySelector({ onCurrencyChange, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const { chainId } = useConnection();
  const [search, setSearch] = useState("");
  const { currencies, isLoading } = useCurrencies(search);
  const { setCustomCurrency } = useUserStore();

  const isEmptyList = !isLoading && currencies.length === 0;

  const onChange = useCallback(
    (currency: Currency) => {
      onCurrencyChange(currency);
      setOpen(false);
      if (currency.imported) {
        setCustomCurrency(chainId ?? 0, currency);
      }
    },
    [onCurrencyChange, setOpen, setCustomCurrency, chainId]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <div onClick={() => setOpen(true)}>{trigger}</div>
      ) : (
        <DialogTrigger>
          <Button>
            <PlusIcon className="size-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md p-0 gap-2">
        <DialogHeader className="p-3">
          <DialogTitle>Select a token</DialogTitle>
        </DialogHeader>
        <SearchInput onChange={setSearch} value={search} />
        <PopularTokens onCurrencyChange={onChange} />
        <div className="flex flex-col gap-2 h-[80vh] max-h-[500px] overflow-y-auto">
          {isEmptyList ? (
            <div className="flex items-center justify-center h-full">
              No results found
            </div>
          ) : isLoading ? (
            <Loader />
          ) : (
            <Virtuoso
              style={{ height: "100%" }}
              data={currencies}
              itemContent={(_, currency) => (
                <CurrencyItem currency={currency} onCurrencyChange={onChange} />
              )}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CurrencyItem = ({
  currency,
  onCurrencyChange,
}: {
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}) => {
  const { ui: balance, isLoading: isLoadingBalance } = useBalance(currency);
  const formattedBalance = useFormatNumber({ value: balance });
  const { formatted: usdPrice, isLoading: isLoadingUsdPrice } = useUSDPrice({
    token: currency.address,
    amount: balance,
    disabled: BN(balance).lte(0),
  });

  return (
    <DialogClose className="w-full px-2">
      <div
        className="flex items-center justify-between px-2 py-2 hover:bg-accent/80 rounded-xl cursor-pointer gap-3 mb-2"
        onClick={() => onCurrencyChange(currency)}
      >
        <div className="flex items-center gap-3 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          <CurrencyLogo currency={currency} />
          <div className="flex flex-col items-start flex-1">
            <p className="text-[16px] font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-[calc(100%-20px)]">
              {currency.name}
            </p>
            <p className="text-[13px] text-muted-foreground font-medium">
              {currency.symbol}
              {!isNativeAddress(currency.address) && (
                <span className="text-[12px] text-muted-foreground/80 ml-1">
                  {makeElipsisAddress(currency.address, { start: 6, end: 4 })}
                </span>
              )}
            </p>
          </div>
        </div>
        {isLoadingBalance || isLoadingUsdPrice ? (
          <Skeleton className="h-4 w-[50px]" />
        ) : (
          BN(formattedBalance ?? "0").gt(0) && (
            <div className="flex flex-col items-end gap-0">
              <p className="text-[17px] font-semibold">${usdPrice}</p>

              <p className="text-[13px] text-muted-foreground">
                {formattedBalance}
              </p>
            </div>
          )
        )}
      </div>
    </DialogClose>
  );
};

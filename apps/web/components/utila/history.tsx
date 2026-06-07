"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CalendarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  ListFilterIcon,
  Loader2Icon,
  SearchIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import {
  OrderStatus,
  OrderType,
  useCancelOrder,
  useDerivedHistoryOrder,
  useSpot,
  type Order,
  type Token,
} from "@orbs-network/spot-react";
import { getNetwork } from "@orbs-network/spot-ui";
import BN from "bignumber.js";
import { toast } from "sonner";
import { CurrencyLogo } from "@/components/ui/currency-logo";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCopyToClipboard } from "@/lib/hooks/common";
import { useActiveConnection } from "@/lib/hooks/use-active-connection";
import { useCurrenciesQuery } from "@/lib/hooks/use-currencies-query";
import { useSpotToken } from "@/lib/hooks/spot-hooks";
import { UTILA_ORDER_TOOLTIPS } from "@/lib/utila-tooltips";
import { Currency } from "@/lib/types";
import {
  cn,
  formatDecimals,
  getChainName,
  getOrderTitle,
  makeEllipsisAddress,
  toAmountUI,
} from "@/lib/utils";

const ALL_STATUSES = "ALL";
const ALL_TYPES = "ALL";
const HISTORY_PAGE_SIZE = 20;
const HISTORY_ROW_HIGHLIGHT_CLASS = "bg-[#f4f5ff] [&>td]:bg-[#f4f5ff]";
const HISTORY_ROW_SELECTED_INTERACTION_CLASS =
  "hover:bg-[#f4f5ff] hover:[&>td]:bg-[#f4f5ff] focus-visible:bg-[#f4f5ff] focus-visible:[&>td]:bg-[#f4f5ff]";
const HISTORY_ROW_INTERACTION_CLASS =
  "hover:bg-[#f8f8f9] hover:[&>td]:bg-[#f8f8f9] focus-visible:bg-[#f8f8f9] focus-visible:[&>td]:bg-[#f8f8f9]";
const MOBILE_DRAWER_QUERY = "(max-width: 767px)";

const subscribeToMobileDrawer = (onStoreChange: () => void) => {
  if (typeof window === "undefined") return () => {};

  const mediaQuery = window.matchMedia(MOBILE_DRAWER_QUERY);

  mediaQuery.addEventListener("change", onStoreChange);

  return () => mediaQuery.removeEventListener("change", onStoreChange);
};

const getMobileDrawerSnapshot = () =>
  typeof window !== "undefined" &&
  window.matchMedia(MOBILE_DRAWER_QUERY).matches;

const getServerMobileDrawerSnapshot = () => false;

const useIsMobileDrawer = () =>
  useSyncExternalStore(
    subscribeToMobileDrawer,
    getMobileDrawerSnapshot,
    getServerMobileDrawerSnapshot,
  );

type UtilaDerivedHistoryOrder = NonNullable<
  ReturnType<typeof useDerivedHistoryOrder>
>;
type UtilaDerivedOrderFill = UtilaDerivedHistoryOrder["fills"][number];

const orderTypes = [
  OrderType.TWAP_MARKET,
  OrderType.TWAP_LIMIT,
  OrderType.LIMIT,
  OrderType.STOP_LOSS_MARKET,
  OrderType.STOP_LOSS_LIMIT,
  OrderType.TAKE_PROFIT_MARKET,
  OrderType.TAKE_PROFIT_LIMIT,
] as const;

const formatCreatedAt = (createdAt?: number) => {
  if (!createdAt) return "-";

  const timestamp =
    createdAt < 1_000_000_000_000 ? createdAt * 1_000 : createdAt;

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp));
};

const getStatusLabel = (status: OrderStatus) => {
  switch (status) {
    case OrderStatus.Open:
      return "Open";
    case OrderStatus.Completed:
      return "Completed";
    case OrderStatus.Cancelled:
      return "Canceled";
    case OrderStatus.Expired:
      return "Expired";
    default:
      return status;
  }
};

const statusPillClassName = (status: OrderStatus) => {
  switch (status) {
    case OrderStatus.Completed:
      return "bg-[#eaf8f2] text-[#249064]";
    case OrderStatus.Open:
      return "bg-[#fff3e4] text-[#d26b16]";
    case OrderStatus.Cancelled:
      return "bg-[#ffe9ec] text-[#f04438]";
    case OrderStatus.Expired:
      return "bg-[#f1f2f6] text-[#70748d]";
    default:
      return "bg-[#f1f2f6] text-[#70748d]";
  }
};

const isPositiveValue = (value?: string | number) => {
  if (value === undefined || value === null || value === "") return false;

  return BN(value).gt(0);
};

const isGreaterThanOneValue = (value?: string | number) => {
  if (value === undefined || value === null || value === "") return false;

  return BN(value).gt(1);
};

const formatTokenAmount = (value?: string, token?: Token, decimals = 6) => {
  if (!isPositiveValue(value)) {
    return "-";
  }

  const amount = formatDecimals(value, decimals);
  return `${amount || "0"}${token?.symbol ? ` ${token.symbol}` : ""}`;
};

const clampProgress = (value?: number) => {
  if (value === undefined || Number.isNaN(value)) return 0;

  return Math.min(100, Math.max(0, value));
};

const formatProgress = (value?: number) =>
  `${formatDecimals(clampProgress(value).toString(), 2) || "0"}%`;

const formatOrderDuration = (milliseconds?: number) => {
  if (!milliseconds) return "";

  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
};

const formatPrice = (
  value: string | undefined,
  srcToken?: Token,
  dstToken?: Token,
) => {
  if (!isPositiveValue(value)) {
    return "-";
  }

  return `1 ${srcToken?.symbol || "token"} = ${formatDecimals(value, 8)} ${
    dstToken?.symbol || "token"
  }`;
};

const UtilaChainLogo = ({
  chain,
}: {
  chain?: { id: number; name: string; iconUrl?: string; logoUrl?: string };
}) => {
  const logoUrl = chain ? (chain.iconUrl ?? chain.logoUrl) : "";
  const name = chain?.name ?? "Chain";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eef0ff] text-[10px] font-bold text-[#4564ff]",
        logoUrl && "bg-cover bg-center bg-no-repeat text-transparent",
      )}
      style={logoUrl ? { backgroundImage: `url(${logoUrl})` } : undefined}
    >
      {!logoUrl && name[0]}
    </span>
  );
};

const tokenToCurrency = (token?: Token): Currency | undefined => {
  if (!token) return undefined;

  return {
    address: token.address,
    decimals: token.decimals,
    logoUrl: token.logoUrl || "",
    name: token.symbol,
    symbol: token.symbol,
  };
};

const csvCell = (value?: string | number | null) => {
  const text = value === undefined || value === null ? "" : String(value);

  return `"${text.replace(/"/g, '""')}"`;
};

const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const exportOrdersToCsv = (
  orders: Order[],
  currencyByAddress: Map<string, Currency>,
) => {
  if (!orders.length) {
    toast.info("No transactions to export");
    return;
  }

  const headers = [
    "Created",
    "Type",
    "Status",
    "Chain",
    "Initiator",
    "From token",
    "From token address",
    "To token",
    "To token address",
    "Input amount",
    "Order ID",
    "Order hash",
    "Transaction hash",
    "Maker",
  ];
  const rows = [...orders]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((order) => {
      const srcToken = currencyByAddress.get(order.srcTokenAddress.toLowerCase());
      const dstToken = currencyByAddress.get(order.dstTokenAddress.toLowerCase());
      const srcAmount = formatDecimals(
        toAmountUI(order.srcAmount, srcToken?.decimals),
        8,
      );

      return [
        formatCreatedAt(order.createdAt),
        getOrderTitle(order.type),
        getStatusLabel(order.status),
        getChainName(order.chainId) || `Chain ${order.chainId}`,
        order.maker,
        srcToken?.symbol,
        order.srcTokenAddress,
        dstToken?.symbol,
        order.dstTokenAddress,
        srcAmount,
        order.id,
        order.hash,
        order.txHash,
        order.maker,
      ];
    });
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(","))
    .join("\n");
  const date = new Date().toISOString().slice(0, 10);

  downloadCsv(`utila-swaps-${date}.csv`, csv);
  toast.success("Transactions exported");
};

const CopyAction = ({
  children,
  className,
  toastMessage,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  toastMessage?: string;
  value?: string;
}) => {
  const copy = useCopyToClipboard();

  if (!value) return null;

  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-[14px] font-semibold text-[#4564ff] transition-colors hover:text-[#3152ff]",
        className,
      )}
      onClick={() => {
        copy(value);

        if (toastMessage) {
          toast.success(toastMessage);
        }
      }}
      type="button"
    >
      {children}
    </button>
  );
};

const DrawerRow = ({
  children,
  label,
  show = true,
  tooltip,
}: {
  children?: React.ReactNode;
  label: string;
  show?: boolean;
  tooltip?: string;
}) => {
  if (!show || children === null || children === undefined || children === "") {
    return null;
  }

  return (
    <div className="grid min-h-[46px] grid-cols-1 gap-1 border-b border-[#e4e6ec] py-[14px] text-[14px] leading-5 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-5">
      <div className="flex min-w-0 items-center gap-1.5 self-start">
        <p className="font-normal text-[#70748d]">{label}</p>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="inline-flex size-4 shrink-0 cursor-help items-center justify-center text-[#717389]"
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
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="min-w-0 font-medium text-[#3f4361]">{children}</div>
    </div>
  );
};

const CopyableText = ({
  className,
  compact = false,
  toastMessage,
  value,
}: {
  className?: string;
  compact?: boolean;
  toastMessage?: string;
  value?: string;
}) => {
  if (!value) {
    return null;
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="min-w-0 break-all">
        {compact ? makeEllipsisAddress(value, { start: 34, end: 12 }) : value}
      </span>
      <CopyAction
        className="shrink-0 text-[#70748d] hover:text-[#4564ff]"
        toastMessage={toastMessage}
        value={value}
      >
        <CopyIcon className="size-4" />
      </CopyAction>
    </div>
  );
};

const DrawerTokenOnly = ({ token }: { token?: Token }) => {
  if (!token) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <CurrencyLogo
        className="size-6 shrink-0"
        currency={tokenToCurrency(token)}
      />
      <span className="truncate text-[14px] font-bold text-[#2f344e]">
        {token.symbol}
      </span>
    </div>
  );
};

const DrawerTokenAmount = ({
  token,
  value,
}: {
  token?: Token;
  value?: string;
}) => {
  if (!isPositiveValue(value)) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {token && (
        <CurrencyLogo
          className="size-6 shrink-0"
          currency={tokenToCurrency(token)}
        />
      )}
      <span className="min-w-0 break-all">
        {formatTokenAmount(value, token, 8)}
      </span>
    </div>
  );
};

const UtilaOrderFillCard = ({
  dstToken,
  fill,
  index,
  srcToken,
}: {
  dstToken?: Token;
  fill: UtilaDerivedOrderFill;
  index: number;
  srcToken?: Token;
}) => {
  const inputToken = srcToken ?? fill.srcToken;
  const outputToken = dstToken ?? fill.dstToken;

  return (
    <article className="rounded-[8px] border border-[#e3e5eb] bg-white px-3">
      <div className="flex min-h-[46px] items-center justify-between gap-4 border-b border-[#e4e6ec] py-[14px]">
        <p className="text-[14px] font-bold text-[#3f4361]">
          Fill #{index + 1}
        </p>
        <p className="whitespace-nowrap text-[13px] font-medium text-[#70748d]">
          {formatCreatedAt(fill.timestamp)}
        </p>
      </div>
      <DrawerRow label="Input amount">
        <DrawerTokenAmount token={inputToken} value={fill.srcAmount} />
      </DrawerRow>
      <DrawerRow label="Received">
        <DrawerTokenAmount token={outputToken} value={fill.dstAmount} />
      </DrawerRow>
      <DrawerRow label="Transaction hash" show={Boolean(fill.txHash)}>
        <CopyableText
          compact
          toastMessage="Transaction hash copied"
          value={fill.txHash}
        />
      </DrawerRow>
    </article>
  );
};

const UtilaOrderFillsDrawer = ({
  dstToken,
  fills,
  onOpenChange,
  open,
  orderTitle,
  srcToken,
}: {
  dstToken?: Token;
  fills: UtilaDerivedOrderFill[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  orderTitle: string;
  srcToken?: Token;
}) => {
  const isMobileDrawer = useIsMobileDrawer();

  return (
    <Drawer modal={false} open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          "z-[60] gap-0 overflow-hidden bg-white p-0 text-[#3f4361]",
          isMobileDrawer
            ? "h-[calc(100dvh-104px)] w-full max-w-none rounded-t-[12px] border-x-0 border-b-0 border-t border-[#e3e5eb] shadow-[0_-5px_20px_rgba(42,47,74,0.16)]"
            : "top-16 left-auto h-auto w-[min(90vw,650px)] max-w-[650px] rounded-none border-y-0 border-r-0 border-l border-[#e3e5eb] shadow-[-5px_0_20px_rgba(42,47,74,0.16)]",
        )}
        data-utila-fills-drawer
        side={isMobileDrawer ? "bottom" : "right"}
        showCloseButton={false}
        showOverlay={false}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[#e4e6ec] px-4 pt-5 pb-4 sm:px-8 sm:pt-7 sm:pb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DrawerTitle className="min-w-0 truncate text-[20px] font-bold leading-7 text-[#3f4361] sm:text-[22px] sm:leading-8">
                  Order fills
                </DrawerTitle>
                <p className="mt-1 text-[13px] font-medium text-[#70748d]">
                  {orderTitle} · {fills.length}{" "}
                  {fills.length === 1 ? "fill" : "fills"}
                </p>
              </div>
              <DrawerClose asChild>
                <button
                  aria-label="Close order fills"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-[7px] text-[#3f4361] hover:bg-[#f4f5f8]"
                  type="button"
                >
                  <XIcon className="size-6" />
                </button>
              </DrawerClose>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
            {fills.length ? (
              <div className="flex flex-col gap-3">
                {fills.map((fill, index) => (
                  <UtilaOrderFillCard
                    dstToken={dstToken}
                    fill={fill}
                    index={index}
                    key={`${fill.txHash || "fill"}-${index}`}
                    srcToken={srcToken}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-[#70748d]">
                <WalletIcon className="size-8" />
                <p className="text-[14px] font-semibold">
                  No fills for this order yet
                </p>
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

const TimelineValue = ({
  completedAt,
  createdAt,
  minedAt,
}: {
  completedAt?: number;
  createdAt?: number;
  minedAt?: number;
}) => {
  const items = [
    { label: "Created", value: createdAt },
    { label: "Mined", value: minedAt },
    { label: "Completed", value: completedAt },
  ].filter((item) => item.value);

  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-6"
          key={item.label}
        >
          <div className="relative flex min-w-0 items-center gap-3">
            <span className="relative z-10 flex size-5 shrink-0 items-center justify-center bg-white">
              <CalendarIcon className="size-4 text-[#3f4361]" />
            </span>
            {index < items.length - 1 && (
              <span className="absolute left-[9px] top-5 h-[22px] w-px bg-[#70748d]" />
            )}
            <span className="truncate font-semibold text-[#3f4361]">
              {item.label}
            </span>
          </div>
          <span className="whitespace-nowrap font-medium text-[#70748d]">
            {formatCreatedAt(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const UtilaOrderDetailsDrawer = ({
  fillsDrawerOpen,
  onFillsDrawerOpenChange,
  onOpenChange,
  open,
  selectedOrderId,
}: {
  fillsDrawerOpen: boolean;
  onFillsDrawerOpenChange: (open: boolean) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedOrderId: string;
}) => {
  const { orders } = useSpot().orderHistoryPanel;
  const isMobileDrawer = useIsMobileDrawer();

  const order = useMemo(
    () => orders.all.find((order) => order.id === selectedOrderId),
    [orders, selectedOrderId],
  );

  const srcToken = useSpotToken(order?.srcTokenAddress);
  const dstToken = useSpotToken(order?.dstTokenAddress);
  const derivedOrder = useDerivedHistoryOrder(order, srcToken, dstToken);

  const chain = order ? getNetwork(order.chainId) : undefined;
  const chainName =
    chain?.name || getChainName(order?.chainId ?? 0) || `Chain ${order?.chainId ?? 0}`;
  const fills = derivedOrder?.fills ?? [];
  const completedAt =
    order?.filledOrderTimestamp ||
    fills[fills.length - 1]?.timestamp ||
    (order?.status === OrderStatus.Completed ? order?.createdAt : undefined);

  if (!order) return null;

  const orderTitle = getOrderTitle(order.type);

  return (
    <Drawer modal={false} open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          "gap-0 overflow-hidden bg-white p-0 text-[#3f4361]",
          isMobileDrawer
            ? "h-[calc(100dvh-104px)] w-full max-w-none rounded-t-[12px] border-x-0 border-b-0 border-t border-[#e3e5eb] shadow-[0_-5px_20px_rgba(42,47,74,0.16)]"
            : "top-16 left-auto h-auto w-[min(90vw,750px)] max-w-[750px] rounded-none border-y-0 border-r-0 border-l border-[#e3e5eb] shadow-[-5px_0_20px_rgba(42,47,74,0.16)]",
        )}
        onInteractOutside={(event) => {
          const target = event.target;

          if (
            target instanceof Element &&
            (target.closest("[data-utila-history-row]") ||
              target.closest("[data-utila-fills-drawer]"))
          ) {
            event.preventDefault();
          }
        }}
        side={isMobileDrawer ? "bottom" : "right"}
        showCloseButton={false}
        showOverlay={false}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[#e4e6ec] px-4 pt-5 pb-4 sm:px-8 sm:pt-7 sm:pb-6">
            <div className="flex items-start justify-between gap-4 sm:gap-6">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <DrawerTitle className="min-w-0 truncate text-[20px] font-bold leading-7 text-[#3f4361] sm:text-[22px] sm:leading-8">
                    {orderTitle}
                  </DrawerTitle>
                  <span
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center rounded-[8px] px-4 text-[14px] font-semibold",
                      statusPillClassName(order.status),
                    )}
                  >
                    {getStatusLabel(order.status)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <CopyAction
                    toastMessage="Order ID copied"
                    value={order.id}
                  >
                    <CopyIcon className="size-4" />
                    Copy ID
                  </CopyAction>
                  <button
                    className="inline-flex cursor-pointer items-center gap-2 text-[14px] font-semibold text-[#4564ff] transition-colors hover:text-[#3152ff]"
                    onClick={() => onFillsDrawerOpenChange(true)}
                    type="button"
                  >
                    Order fills ({fills.length})
                    <ChevronRightIcon className="size-4" />
                  </button>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-5">
                <UtilaCancelOrderButton order={order} size="drawer" />
                <DrawerClose asChild>
                  <button
                    aria-label="Close order details"
                    className="flex size-8 cursor-pointer items-center justify-center rounded-[7px] text-[#3f4361] hover:bg-[#f4f5f8]"
                    type="button"
                  >
                    <XIcon className="size-6" />
                  </button>
                </DrawerClose>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-8 sm:pb-10">
            <DrawerRow
              label="Input amount"
              show={isPositiveValue(derivedOrder?.srcAmountUI)}
            >
              <DrawerTokenAmount
                token={srcToken}
                value={derivedOrder?.srcAmountUI}
              />
            </DrawerRow>
            <DrawerRow label="Initiator" show={Boolean(order.maker)}>
              <CopyableText
                compact
                toastMessage="Initiator copied"
                value={order.maker}
              />
            </DrawerRow>
            <DrawerRow label="Blockchain" show={Boolean(chainName)}>
              <span className="inline-flex items-center gap-2">
                <UtilaChainLogo chain={chain} />
                {chainName}
              </span>
            </DrawerRow>
            <DrawerRow
              label="Transaction hash"
              show={Boolean(order.txHash || order.hash)}
            >
              <CopyableText
                compact
                toastMessage="Transaction hash copied"
                value={order.txHash || order.hash}
              />
            </DrawerRow>
            <DrawerRow
              label="Timeline"
              show={Boolean(order.createdAt || order.txHash || completedAt)}
            >
              <TimelineValue
                completedAt={completedAt}
                createdAt={order.createdAt}
                minedAt={order.txHash ? order.createdAt : undefined}
              />
            </DrawerRow>
            <DrawerRow label="Order ID" show={Boolean(order.id)}>
              <CopyableText
                compact
                toastMessage="Order ID copied"
                value={order.id}
              />
            </DrawerRow>
            <DrawerRow label="Order type" show={Boolean(order.type)}>
              {getOrderTitle(order.type)}
            </DrawerRow>
            <DrawerRow
              label="Expiration"
              show={Boolean(derivedOrder?.deadline)}
              tooltip={UTILA_ORDER_TOOLTIPS.expiration}
            >
              {formatCreatedAt(derivedOrder?.deadline)}
            </DrawerRow>
            <DrawerRow label="From token" show={Boolean(srcToken)}>
              <DrawerTokenOnly token={srcToken} />
            </DrawerRow>
            <DrawerRow label="To token" show={Boolean(dstToken)}>
              <DrawerTokenOnly token={dstToken} />
            </DrawerRow>
            <DrawerRow
              label="Individual trade size"
              show={
                derivedOrder &&
                derivedOrder?.totalTrades > 1 &&
                isPositiveValue(derivedOrder?.sizePerTradeUI)
              }
              tooltip={UTILA_ORDER_TOOLTIPS.individualTradeSize}
            >
              <DrawerTokenAmount
                token={srcToken}
                value={derivedOrder?.sizePerTradeUI}
              />
            </DrawerRow>
            <DrawerRow
              label="No. of trades"
              show={derivedOrder && derivedOrder?.totalTrades > 1}
              tooltip={UTILA_ORDER_TOOLTIPS.numberOfTrades}
            >
              {derivedOrder?.totalTrades}
            </DrawerRow>
            <DrawerRow
              label="Min received"
              show={isGreaterThanOneValue(derivedOrder?.dstMinAmount)}
              tooltip={UTILA_ORDER_TOOLTIPS.minReceived}
            >
              <DrawerTokenAmount
                token={dstToken}
                value={derivedOrder?.dstMinAmountUI}
              />
            </DrawerRow>

            <DrawerRow
              label="Min received per chunk"
              show={
                derivedOrder &&
                derivedOrder?.totalTrades > 1 &&
                isGreaterThanOneValue(derivedOrder?.minDestAmountPerTrade)
              }
              tooltip={UTILA_ORDER_TOOLTIPS.minReceived}
            >
              <DrawerTokenAmount
                token={dstToken}
                value={derivedOrder?.minDestAmountPerTradeUI}
              />
            </DrawerRow>
            <DrawerRow
              label="Trade interval"
              show={
                derivedOrder &&
                derivedOrder?.totalTrades > 1 &&
                Boolean(derivedOrder.tradeInterval)
              }
              tooltip={UTILA_ORDER_TOOLTIPS.tradeInterval}
            >
              {formatOrderDuration(derivedOrder?.tradeInterval)}
            </DrawerRow>
            <DrawerRow
              label="Amount filled"
              show={
                isPositiveValue(derivedOrder?.amountInFilledUI) ||
                isPositiveValue(derivedOrder?.amountOutFilledUI)
              }
            >
              <div className="flex flex-col gap-1">
                {isPositiveValue(derivedOrder?.amountInFilledUI) && (
                  <DrawerTokenAmount
                    token={srcToken}
                    value={derivedOrder?.amountInFilledUI}
                  />
                )}
                {isPositiveValue(derivedOrder?.amountOutFilledUI) && (
                  <DrawerTokenAmount
                    token={dstToken}
                    value={derivedOrder?.amountOutFilledUI}
                  />
                )}
              </div>
            </DrawerRow>
            <DrawerRow
              label="Progress"
              show={derivedOrder && derivedOrder?.progress !== undefined}
            >
              <ProgressValue value={derivedOrder?.progress} />
            </DrawerRow>
            <DrawerRow
              label="Average price"
              show={isPositiveValue(derivedOrder?.executionPriceUI)}
            >
              {formatPrice(derivedOrder?.executionPriceUI, srcToken, dstToken)}
            </DrawerRow>
            <DrawerRow
              label="Limit price"
              show={isPositiveValue(derivedOrder?.limitPriceUI)}
              tooltip={UTILA_ORDER_TOOLTIPS.limitPrice}
            >
              {formatPrice(derivedOrder?.limitPriceUI, srcToken, dstToken)}
            </DrawerRow>
            <DrawerRow
              label="Trigger Price"
              show={isPositiveValue(derivedOrder?.triggerPriceUI)}
              tooltip={UTILA_ORDER_TOOLTIPS.triggerPrice}
            >
              {formatPrice(derivedOrder?.triggerPriceUI, srcToken, dstToken)}
            </DrawerRow>
          </div>
        </div>
      </DrawerContent>
      <UtilaOrderFillsDrawer
        dstToken={dstToken}
        fills={fills}
        onOpenChange={onFillsDrawerOpenChange}
        open={open && fillsDrawerOpen}
        orderTitle={orderTitle}
        srcToken={srcToken}
      />
    </Drawer>
  );
};

const useFilteredOrders = ({
  query,
  status,
  type,
}: {
  query: string;
  status: string;
  type: string;
}) => {
  const { orders } = useSpot().orderHistoryPanel;

  return useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...orders.all]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((order) => {
        if (status !== ALL_STATUSES && order.status !== status) {
          return false;
        }

        if (type !== ALL_TYPES && order.type !== type) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return [
          order.id,
          order.hash,
          order.maker,
          order.srcTokenAddress,
          order.dstTokenAddress,
          order.txHash,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery));
      });
  }, [orders.all, query, status, type]);
};

const TokenValue = ({ currency }: { currency?: Currency }) => {
  if (!currency) {
    return <span className="text-[#9aa0b3]">-</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <CurrencyLogo className="size-4 shrink-0" currency={currency} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold leading-4 text-[#3f4361]">
          {currency.symbol}
        </p>
        <p className="truncate text-[12px] font-medium leading-4 text-[#70748d]">
          {makeEllipsisAddress(currency.address, { start: 8, end: 6 })}
        </p>
      </div>
    </div>
  );
};

const AmountValue = ({
  order,
  srcToken,
}: {
  order: Order;
  srcToken?: Currency;
}) => {
  const amount = formatDecimals(
    toAmountUI(order.srcAmount, srcToken?.decimals),
    8,
  );

  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] font-bold leading-4 text-[#3f4361]">
        {amount || "0"} {srcToken?.symbol || ""}
      </p>
    </div>
  );
};

const ProgressValue = ({ value }: { value?: number }) => {
  const progress = clampProgress(value);

  return (
    <div className="flex min-w-[118px] items-center gap-2">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#eceef6]">
        <div
          className="h-full rounded-full bg-[#4564ff]"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[12px] font-bold text-[#3f4361]">
        {formatProgress(value)}
      </span>
    </div>
  );
};

const UtilaCancelOrderButton = ({
  className,
  order,
  size = "row",
}: {
  className?: string;
  order: Order;
  size?: "row" | "drawer";
}) => {
  const { address } = useActiveConnection();
  const { cancelOrder, isLoading } = useCancelOrder(order);
  const isDrawer = size === "drawer";

  if (order.status !== OrderStatus.Open) return null;

  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[7px] border border-[#ffd5d9] bg-white font-semibold text-[#f04438] transition-colors hover:bg-[#fff1f3] disabled:cursor-not-allowed disabled:border-[#e5e7ee] disabled:text-[#a4a8b8] disabled:hover:bg-white",
        isDrawer ? "h-9 px-4 text-[13px]" : "h-7 px-3 text-[12px]",
        className,
      )}
      disabled={!address || isLoading}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void cancelOrder();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
      title={!address ? "Connect wallet to cancel this order" : undefined}
      type="button"
    >
      {isLoading ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <XIcon className="size-3.5" />
      )}
      <span>{isLoading ? "Canceling..." : "Cancel"}</span>
    </button>
  );
};

const HistoryRow = ({
  onSelect,
  order,
  selected,
  srcToken,
  dstToken,
}: {
  dstToken?: Currency;
  onSelect: (order: Order) => void;
  order: Order;
  selected: boolean;
  srcToken?: Currency;
}) => {
  return (
    <tr
      className={cn(
        "h-[70px] cursor-pointer border-b border-[#eceef3] align-middle transition-colors last:border-b-0 focus-visible:outline-none [&>td]:transition-colors",
        selected
          ? `${HISTORY_ROW_HIGHLIGHT_CLASS} ${HISTORY_ROW_SELECTED_INTERACTION_CLASS}`
          : `bg-white [&>td]:bg-white ${HISTORY_ROW_INTERACTION_CLASS}`,
      )}
      data-utila-history-row
      onClick={() => onSelect(order)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(order);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <td className="w-[170px] px-6 py-3 text-[13px] font-medium text-[#3f4361]">
        {formatCreatedAt(order.createdAt)}
      </td>
      <td className="w-[150px] px-3 py-3">
        <div>
          <p className="text-[13px] font-bold leading-4 text-[#3f4361]">
            {getOrderTitle(order.type)}
          </p>
          <p className="text-[12px] font-medium leading-4 text-[#70748d]">
            via Spot
          </p>
        </div>
      </td>
      <td className="min-w-[240px] px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">

            <p className="truncate text-[12px] font-medium leading-4 text-[#70748d]">
              {makeEllipsisAddress(order.maker, { start: 8, end: 6 })}
            </p>
          </div>
        </div>
      </td>
      <td className="min-w-[210px] px-3 py-3">
        <TokenValue currency={srcToken} />
      </td>
      <td className="min-w-[210px] px-3 py-3">
        <TokenValue currency={dstToken} />
      </td>
      <td className="min-w-[210px] px-3 py-3">
        <AmountValue order={order} srcToken={srcToken} />
      </td>
      <td className="w-[160px] px-3 py-3">
        <ProgressValue value={order.progress} />
      </td>
      <td className="w-[160px] px-3 py-3">
        <span
          className={cn(
            "inline-flex h-[26px] items-center rounded-[7px] px-3 text-[12px] font-medium",
            statusPillClassName(order.status),
          )}
        >
          {order.status === OrderStatus.Completed && (
            <CheckCircleIcon className="mr-1 size-3" />
          )}
          {getStatusLabel(order.status)}
        </span>
      </td>
    </tr>
  );
};

const HistorySkeleton = () => {
  return (
    <>
      {Array.from({ length: 8 }).map((_, index) => (
        <tr className="h-[70px] border-b border-[#eceef3]" key={index}>
          {Array.from({ length: 8 }).map((__, cellIndex) => (
            <td className="px-3 py-3" key={cellIndex}>
              <Skeleton className="h-4 w-full max-w-[160px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
};

const HistoryEmptyState = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-3 text-[#70748d]",
      className,
    )}
  >
    <WalletIcon className="size-8" />
    <p className="text-[14px] font-semibold">No Spot orders found</p>
  </div>
);

const HistoryMobileSkeleton = () => (
  <div className="flex flex-col gap-2 p-3">
    {Array.from({ length: 5 }).map((_, index) => (
      <div
        className="rounded-[8px] border border-[#eceef3] bg-white p-3"
        key={index}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-20 rounded-[7px]" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="mt-3 h-4 w-full" />
      </div>
    ))}
  </div>
);

const HistoryMobileCard = ({
  dstToken,
  onSelect,
  order,
  selected,
  srcToken,
}: {
  dstToken?: Currency;
  onSelect: (order: Order) => void;
  order: Order;
  selected: boolean;
  srcToken?: Currency;
}) => {
  return (
    <div
      className={cn(
        "cursor-pointer border-b border-[#eceef3] bg-white p-3 transition-colors last:border-b-0 focus-visible:outline-none",
        selected ? HISTORY_ROW_HIGHLIGHT_CLASS : "hover:bg-[#f8f8f9]",
      )}
      data-utila-history-row
      onClick={() => onSelect(order)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(order);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold leading-5 text-[#2f344e]">
            {getOrderTitle(order.type)}
          </p>
          <p className="mt-0.5 text-[12px] font-medium leading-4 text-[#70748d]">
            {formatCreatedAt(order.createdAt)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex h-[26px] shrink-0 items-center rounded-[7px] px-3 text-[12px] font-medium",
            statusPillClassName(order.status),
          )}
        >
          {order.status === OrderStatus.Completed && (
            <CheckCircleIcon className="mr-1 size-3" />
          )}
          {getStatusLabel(order.status)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="min-w-0 rounded-[7px] bg-[#fbfbfd] p-2">
          <p className="mb-1 text-[11px] font-semibold uppercase text-[#70748d]">
            From
          </p>
          <TokenValue currency={srcToken} />
        </div>
        <div className="min-w-0 rounded-[7px] bg-[#fbfbfd] p-2">
          <p className="mb-1 text-[11px] font-semibold uppercase text-[#70748d]">
            To
          </p>
          <TokenValue currency={dstToken} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-[#70748d]">
            Input amount
          </p>
          <AmountValue order={order} srcToken={srcToken} />
        </div>
        <ProgressValue value={order.progress} />
      </div>
    </div>
  );
};

const UtilaHistoryFilters = ({
  activeFilterCount,
  onClear,
  onStatusChange,
  onTypeChange,
  status,
  type,
}: {
  activeFilterCount: number;
  onClear: () => void;
  onStatusChange: (status: string) => void;
  onTypeChange: (type: string) => void;
  status: string;
  type: string;
}) => {
  const statusLabel =
    status === ALL_STATUSES ? "Status" : getStatusLabel(status as OrderStatus);
  const typeLabel =
    type === ALL_TYPES ? "Transaction Type" : getOrderTitle(type as OrderType);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[7px] border border-[#dfe2ec] bg-white px-3 text-[13px] font-semibold text-[#4564ff] transition-colors hover:bg-[#f4f5ff] sm:h-8",
            activeFilterCount > 0 && "border-[#4564ff] bg-[#f4f5ff]",
          )}
          type="button"
        >
          <ListFilterIcon className="size-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-[#4564ff] text-[10px] font-bold leading-none text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(calc(100vw-24px),320px)] rounded-[8px] border-[#dfe2ec] bg-white p-3 text-[#3f4361] shadow-[0_8px_24px_rgba(42,47,74,0.12)]"
        sideOffset={8}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-bold text-[#2f344e]">Filters</p>
          {activeFilterCount > 0 && (
            <button
              className="cursor-pointer text-[12px] font-semibold text-[#4564ff] hover:text-[#3152ff]"
              onClick={onClear}
              type="button"
            >
              Reset
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-[#70748d]">
              Status
            </span>
            <Select onValueChange={onStatusChange} value={status}>
              <SelectTrigger className="h-9 w-full rounded-[7px] border-[#dfe2ec] bg-[#fbfbfd] text-[13px] font-medium text-[#3f4361] shadow-none">
                <SelectValue>{statusLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent className="border-[#dfe2ec] bg-white text-[#3f4361]">
                <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
                {Object.values(OrderStatus).map((item) => (
                  <SelectItem key={item} value={item}>
                    {getStatusLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-[#70748d]">
              Transaction Type
            </span>
            <Select onValueChange={onTypeChange} value={type}>
              <SelectTrigger className="h-9 w-full rounded-[7px] border-[#dfe2ec] bg-[#fbfbfd] text-[13px] font-medium text-[#3f4361] shadow-none">
                <SelectValue>{typeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent className="border-[#dfe2ec] bg-white text-[#3f4361]">
                <SelectItem value={ALL_TYPES}>All transaction types</SelectItem>
                {orderTypes.map((item) => (
                  <SelectItem key={item} value={item}>
                    {getOrderTitle(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const UtilaHistoryTable = () => {
  const { isLoading, orders } = useSpot().orderHistoryPanel;
  const { address } = useActiveConnection();
  const { data: currencies = [] } = useCurrenciesQuery();
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  const [type, setType] = useState<string>(ALL_TYPES);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fillsDrawerOpen, setFillsDrawerOpen] = useState(false);
  const filteredOrders = useFilteredOrders({ query, status, type });
  const pageCount = Math.max(
    1,
    Math.ceil(filteredOrders.length / HISTORY_PAGE_SIZE),
  );
  const currentPage = Math.min(page, pageCount);
  const pageStartIndex = filteredOrders.length
    ? (currentPage - 1) * HISTORY_PAGE_SIZE
    : 0;
  const pageEndIndex = Math.min(
    pageStartIndex + HISTORY_PAGE_SIZE,
    filteredOrders.length,
  );
  const paginatedOrders = useMemo(
    () => filteredOrders.slice(pageStartIndex, pageEndIndex),
    [filteredOrders, pageEndIndex, pageStartIndex],
  );
  const currencyByAddress = useMemo(
    () =>
      new Map(
        currencies.map((currency) => [currency.address.toLowerCase(), currency]),
      ),
    [currencies],
  );

  const handleSelectOrder = useCallback(
    (order: Order) => {
      if (drawerOpen && selectedOrderId === order.id) {
        setFillsDrawerOpen(false);
        setDrawerOpen(false);
        return;
      }

      setFillsDrawerOpen(false);
      setSelectedOrderId(order.id);
      setDrawerOpen(true);
    },
    [
      drawerOpen,
      selectedOrderId,
      setFillsDrawerOpen,
      setSelectedOrderId,
      setDrawerOpen,
    ],
  );
  const handleDrawerOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setFillsDrawerOpen(false);
    }

    setDrawerOpen(nextOpen);
  }, []);
  const handleStatusChange = useCallback((nextStatus: string) => {
    setStatus(nextStatus);
    setPage(1);
  }, []);
  const handleTypeChange = useCallback((nextType: string) => {
    setType(nextType);
    setPage(1);
  }, []);
  const handleClearFilters = useCallback(() => {
    setStatus(ALL_STATUSES);
    setType(ALL_TYPES);
    setPage(1);
  }, []);
  const handleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      setPage(1);
    },
    [],
  );
  const goToPreviousPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);
  const goToNextPage = useCallback(() => {
    setPage((current) => Math.min(pageCount, current + 1));
  }, [pageCount]);
  const handleExportOrders = useCallback(() => {
    exportOrdersToCsv(orders.all, currencyByAddress);
  }, [currencyByAddress, orders.all]);
  const activeFilterCount =
    Number(status !== ALL_STATUSES) + Number(type !== ALL_TYPES);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 sm:gap-4">
      <div className="flex shrink-0 items-center gap-2">
        <UtilaHistoryFilters
          activeFilterCount={activeFilterCount}
          onClear={handleClearFilters}
          onStatusChange={handleStatusChange}
          onTypeChange={handleTypeChange}
          status={status}
          type={type}
        />
        <div className="relative h-9 min-w-0 flex-1 sm:h-8 sm:max-w-[320px]">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#70748d]" />
          <Input
            aria-label="Search order history"
            className="h-full rounded-[7px] border-[#dfe2ec] bg-white pl-9 text-[13px] font-medium text-[#3f4361] shadow-none placeholder:text-[#70748d] focus-visible:border-[#4564ff] focus-visible:ring-0"
            onChange={handleQueryChange}
            placeholder="Address or order id"
            value={query}
          />
        </div>
      </div>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[7px] border border-[#e3e5eb] bg-white shadow-[0_2px_8px_rgba(42,47,74,0.08)]">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#eef0f4] px-3 sm:h-[64px] sm:px-6">
          <h1 className="text-[15px] font-bold text-[#2f344e]">
            Transactions ({orders.all.length})
          </h1>
          {address && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Export transactions"
                  className="inline-flex size-8 cursor-pointer items-center justify-center rounded-[7px] text-[#4564ff] transition-colors hover:bg-[#f4f5ff]"
                  onClick={handleExportOrders}
                  type="button"
                >
                  <DownloadIcon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                arrowClassName="bg-[#2f3033] fill-[#2f3033]"
                className="rounded-[6px] bg-[#2f3033] px-3 py-2 text-[12px] font-semibold text-white"
                sideOffset={8}
              >
                Export transactions
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto sm:hidden">
            {isLoading ? (
              <HistoryMobileSkeleton />
            ) : filteredOrders.length ? (
              paginatedOrders.map((order) => (
                <HistoryMobileCard
                  dstToken={currencyByAddress.get(
                    order.dstTokenAddress.toLowerCase(),
                  )}
                  key={order.id}
                  onSelect={handleSelectOrder}
                  order={order}
                  selected={drawerOpen && selectedOrderId === order.id}
                  srcToken={currencyByAddress.get(
                    order.srcTokenAddress.toLowerCase(),
                  )}
                />
              ))
            ) : (
              <HistoryEmptyState className="h-full min-h-[360px]" />
            )}
          </div>

          <div className="hidden h-full overflow-auto sm:block">
            <table className="min-w-[1360px] w-full border-collapse text-left">
              <thead className="sticky top-0 z-10">
                <tr className="h-[49px] border-b border-[#eceef3] bg-white">
                  {[
                    "CREATED",
                    "TYPE",
                    "INITIATOR",
                    "FROM",
                    "TO",
                    "AMOUNT",
                    "PROGRESS",
                    "STATUS",
                  ].map((header) => (
                    <th
                      className="px-3 text-[12px] font-bold uppercase text-[#2f344e] first:px-6"
                      key={header}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <HistorySkeleton />
                ) : filteredOrders.length ? (
                  paginatedOrders.map((order) => (
                    <HistoryRow
                      dstToken={currencyByAddress.get(
                        order.dstTokenAddress.toLowerCase(),
                      )}
                      key={order.id}
                      onSelect={handleSelectOrder}
                      order={order}
                      selected={drawerOpen && selectedOrderId === order.id}
                      srcToken={currencyByAddress.get(
                        order.srcTokenAddress.toLowerCase(),
                      )}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <HistoryEmptyState className="h-[360px]" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-t border-[#eef0f4] px-3 text-[12px] font-medium text-[#3f4361] sm:justify-end sm:gap-8 sm:px-6 sm:text-[13px]">
          <span>
            {filteredOrders.length
              ? `${pageStartIndex + 1} to ${pageEndIndex} of ${
                  filteredOrders.length
                }`
              : "0 to 0 of 0"}
          </span>
          <div className="flex items-center gap-3">
            <button
              aria-label="Previous page"
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[7px] text-[#70748d] transition-colors hover:bg-[#f7f7f9] disabled:cursor-not-allowed disabled:text-[#c7cada] disabled:hover:bg-transparent"
              disabled={currentPage <= 1 || filteredOrders.length === 0}
              onClick={goToPreviousPage}
              type="button"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <span>
              Page {filteredOrders.length ? currentPage : 1} of {pageCount}
            </span>
            <button
              aria-label="Next page"
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[7px] text-[#70748d] transition-colors hover:bg-[#f7f7f9] disabled:cursor-not-allowed disabled:text-[#c7cada] disabled:hover:bg-transparent"
              disabled={currentPage >= pageCount || filteredOrders.length === 0}
              onClick={goToNextPage}
              type="button"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </div>
      </section>

      {selectedOrderId && (
        <UtilaOrderDetailsDrawer
          fillsDrawerOpen={fillsDrawerOpen}
          onFillsDrawerOpenChange={setFillsDrawerOpen}
          onOpenChange={handleDrawerOpenChange}
          open={drawerOpen}
          selectedOrderId={selectedOrderId}
        />
      )}
    </div>
  );
};


const Listeners = () => {

  useEffect(() => {
    document.body.classList.remove("dark");
    document.body.classList.add("utila-mode");

    return () => {
      document.body.classList.remove("utila-mode");
      document.body.classList.add("dark");
    };
  }, []);

  return null;
}

export function UtilaHistory() {
  return (
    <main className="h-[calc(100dvh-104px)] w-full min-w-0 overflow-hidden bg-white px-3 py-3 text-[#3f4361] md:ml-[230px] md:h-[calc(100vh-64px)] md:w-[calc(100vw-230px)] md:px-6 md:py-5">
      <UtilaHistoryTable />
      <Listeners />
    </main>
  );
}

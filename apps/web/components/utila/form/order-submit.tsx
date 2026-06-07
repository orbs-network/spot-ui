"use client";

import { useCallback, useMemo, useState } from "react";
import BN from "bignumber.js";
import {
  DISCLAIMER_URL,
  Steps,
  SwapStatus as SpotSwapStatus,
  useExplorerLink,
  useSpot,
} from "@orbs-network/spot-react";
import type { Step } from "@orbs-network/swap-ui";
import { WalletButton } from "@rainbow-me/rainbowkit";
import { InfoIcon } from "lucide-react";
import { CurrencyLogo } from "@/components/ui/currency-logo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { useActiveConnection } from "@/lib/hooks/use-active-connection";
import { useUtilaConnectRetry } from "@/lib/hooks/use-utila-connect-retry";
import { useTranslations } from "@/lib/use-translations";
import { UTILA_ORDER_TOOLTIPS } from "@/lib/utila-tooltips";
import { Currency } from "@/lib/types";
import { formatDecimals, getOrderTitle } from "@/lib/utils";
import {
  getUtilaCompletedResultSteps,
  getUtilaFailedResultSteps,
  UTILA_EXPLORER_FOOTER_TEXT,
  UTILA_WALLET_FOOTER_TEXT,
  type UtilaCompletedStep,
  UtilaStepResultsCard,
  UtilaStepProgress,
} from "./shared";

const tokenToCurrency = (token?: {
  address?: string;
  decimals?: number;
  logoUrl?: string;
  symbol?: string;
}): Currency | undefined => {
  if (!token?.address || token.decimals === undefined || !token.symbol) {
    return undefined;
  }

  return {
    address: token.address,
    decimals: token.decimals,
    logoUrl: token.logoUrl || "",
    name: token.symbol,
    symbol: token.symbol,
  };
};

const formatOrderDate = (value?: number) => {
  if (!value) return "";

  const timestamp = value < 1_000_000_000_000 ? value * 1_000 : value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
};

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

const formatOrderUsdSuffix = (value?: string) => {
  const formatted = formatDecimals(value, 2);

  return formatted ? ` (≈ $${formatted})` : "";
};

const isGreaterThanOneValue = (value?: string | number) => {
  if (value === undefined || value === null || value === "") return false;

  return BN(value).gt(1);
};

const UtilaOrderDetailRow = ({
  label,
  tooltip,
  value,
}: {
  label: string;
  tooltip?: string;
  value: string;
}) => (
  <div className="flex min-h-8 items-center justify-between gap-4 border-b border-[#eceef3] py-2 last:border-b-0">
    <div className="flex items-center gap-1.5">
      <p className="text-[13px] font-medium text-[#70748d]">{label}</p>
      {tooltip && (
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
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
    <p className="min-w-0 truncate text-right text-[13px] font-semibold text-[#3f4361]">
      {value}
    </p>
  </div>
);

const UtilaOrderSummary = () => {
  const order = useSpot().derivedFormData;
  const srcCurrency = tokenToCurrency(order.srcToken);
  const dstCurrency = tokenToCurrency(order.dstToken);

  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-[#e3e5eb] bg-[#fbfbfd] p-3">
      {[
        {
          amount: order.srcAmountUI,
          currency: srcCurrency,
          label: "From",
          usd: order.srcAmountUsd,
        },
        {
          amount: order.dstAmountUI,
          currency: dstCurrency,
          label: "To",
          usd: order.dstAmountUsd,
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
              ≈ ${formatDecimals(row.usd || "0", 2) || "0"}
            </p>
          </div>
          <CurrencyLogo className="size-8 shrink-0" currency={row.currency} />
        </div>
      ))}
    </div>
  );
};

const UtilaOrderDetails = ({ orderTitle }: { orderTitle: string }) => {
  const t = useTranslations();
  const order = useSpot().derivedFormData;
  const srcSymbol = order.srcToken?.symbol || "";
  const dstSymbol = order.dstToken?.symbol || "";
  const totalTrades = order.totalTrades || 1;
  const rows = [
    { label: "Order type", value: `${orderTitle} order` },
    order.triggerPriceUI && {
      label: t("triggerPrice"),
      tooltip: UTILA_ORDER_TOOLTIPS.triggerPrice,
      value: `1 ${srcSymbol} = ${formatDecimals(
        order.triggerPriceUI,
        6,
      )} ${dstSymbol}${formatOrderUsdSuffix(order.triggerPriceUsd)}`,
    },
    order.limitPriceUI && {
      label: t("limitPrice"),
      tooltip: UTILA_ORDER_TOOLTIPS.limitPrice,
      value: `1 ${srcSymbol} = ${formatDecimals(
        order.limitPriceUI,
        6,
      )} ${dstSymbol}${formatOrderUsdSuffix(order.limitPriceUsd)}`,
    },
    isGreaterThanOneValue(order.minDestAmountPerTrade) && {
      label: t(totalTrades > 1 ? "minReceivedPerTrade" : "minReceived"),
      tooltip: UTILA_ORDER_TOOLTIPS.minReceived,
      value: `${formatDecimals(
        order.minDestAmountPerTradeUI,
        6,
      )} ${dstSymbol}${formatOrderUsdSuffix(order.minDestAmountPerTradeUsd)}`,
    },
    totalTrades > 1 &&
      order.sizePerTradeUI && {
        label: t("individualTradeSize"),
        tooltip: UTILA_ORDER_TOOLTIPS.individualTradeSize,
        value: `${formatDecimals(order.sizePerTradeUI, 6)} ${srcSymbol}`,
      },
    totalTrades > 1 && {
      label: t("numberOfTrades"),
      tooltip: UTILA_ORDER_TOOLTIPS.numberOfTrades,
      value: `${totalTrades}`,
    },
    totalTrades > 1 &&
      order.tradeInterval && {
        label: t("tradeIntervalLabel"),
        tooltip: UTILA_ORDER_TOOLTIPS.tradeInterval,
        value: formatOrderDuration(order.tradeInterval),
      },
    order.deadline && {
      label: t("expirationLabel"),
      tooltip: UTILA_ORDER_TOOLTIPS.expiration,
      value: formatOrderDate(order.deadline),
    },
    order.feesAmount && {
      label: t("fees", { value: `${order.feesPercentage}%` }),
      value: `${formatDecimals(order.feesAmountUI, 6)} ${dstSymbol}${
        order.feesUsd ? ` (≈ $${formatDecimals(order.feesUsd, 2)})` : ""
      }`,
    },
  ].filter(Boolean) as Array<{
    label: string;
    tooltip?: string;
    value: string;
  }>;

  return (
    <div className="rounded-[8px] border border-[#e3e5eb] bg-white px-3">
      {rows.map((row) => (
        <UtilaOrderDetailRow
          key={row.label}
          label={row.label}
          tooltip={row.tooltip}
          value={row.value}
        />
      ))}
    </div>
  );
};

const useUtilaOrderStep = (orderTitle: string) => {
  const {
    approveTxHash,
    srcToken,
    status,
    step,
    wrapTxHash,
  } = useSpot().orderExecutionPanel;
  const wrapExplorerUrl = useExplorerLink(wrapTxHash);
  const approveExplorerUrl = useExplorerLink(approveTxHash);
  const symbol = srcToken?.symbol || "token";

  return useMemo((): Step | undefined => {
    if (step === Steps.WRAP) {
      return {
        footerLink: wrapExplorerUrl,
        footerText: wrapExplorerUrl
          ? UTILA_EXPLORER_FOOTER_TEXT
          : UTILA_WALLET_FOOTER_TEXT,
        title: `Wrap ${symbol}`,
      };
    }

    if (step === Steps.APPROVE) {
      return {
        footerLink: approveExplorerUrl,
        footerText: approveExplorerUrl
          ? UTILA_EXPLORER_FOOTER_TEXT
          : UTILA_WALLET_FOOTER_TEXT,
        title: `Approve ${symbol}`,
      };
    }

    return {
      footerText:
        status === SpotSwapStatus.LOADING ? UTILA_WALLET_FOOTER_TEXT : undefined,
      title: `Create ${orderTitle} order`,
    };
  }, [approveExplorerUrl, orderTitle, status, step, symbol, wrapExplorerUrl]);
};

const useUtilaOrderResultSteps = (orderTitle: string) => {
  const {
    approveTxHash,
    pendingSteps,
    srcToken,
    wrapTxHash,
  } = useSpot().orderExecutionPanel;
  const wrapExplorerUrl = useExplorerLink(wrapTxHash);
  const approveExplorerUrl = useExplorerLink(approveTxHash);
  const symbol = srcToken?.symbol || "token";

  return useMemo((): UtilaCompletedStep[] => {
    const completedSteps = pendingSteps?.length ? pendingSteps : [Steps.CREATE];

    return completedSteps.map((step) => {
      if (step === Steps.WRAP) {
        return {
          footerLink: wrapExplorerUrl,
          footerText: wrapExplorerUrl ? UTILA_EXPLORER_FOOTER_TEXT : undefined,
          title: `Wrap ${symbol}`,
        };
      }

      if (step === Steps.APPROVE) {
        return {
          footerLink: approveExplorerUrl,
          footerText: approveExplorerUrl
            ? UTILA_EXPLORER_FOOTER_TEXT
            : undefined,
          title: `Approve ${symbol}`,
        };
      }

      return {
        title: `Create ${orderTitle} order`,
      };
    });
  }, [approveExplorerUrl, orderTitle, pendingSteps, symbol, wrapExplorerUrl]);
};

const UtilaOrderTerminalState = ({
  message,
  onClose,
  orderTitle,
  state,
}: {
  message?: string;
  onClose: () => void;
  orderTitle: string;
  state: "success" | "failed";
}) => {
  const { stepIndex } = useSpot().orderExecutionPanel;
  const steps = useUtilaOrderResultSteps(orderTitle);
  const resultSteps = useMemo(() => {
    if (state === "failed") {
      return getUtilaFailedResultSteps({
        failedStepIndex: stepIndex,
        message,
        steps,
      });
    }

    return getUtilaCompletedResultSteps(steps).map((step) => ({
      ...step,
      footerText: step.footerText || "Completed",
    }));
  }, [message, state, stepIndex, steps]);

  return (
    <div className="flex flex-col gap-4">
      <UtilaOrderSummary />
      <UtilaStepResultsCard steps={resultSteps} />
      <button
        className="h-10 cursor-pointer rounded-[8px] bg-[#4564ff] text-[15px] font-semibold text-white transition-colors hover:bg-[#3152ff]"
        onClick={onClose}
        type="button"
      >
        Close
      </button>
    </div>
  );
};

const UtilaOrderReview = ({
  orderTitle,
  onSubmit,
  loading,
}: {
  orderTitle: string;
  onSubmit: () => Promise<unknown> | void;
  loading: boolean;
}) => {
  const [disclaimerAccept, setDisclaimerAccept] = useState(true);
  const { status, stepIndex, totalSteps } = useSpot().orderExecutionPanel;
  const currentStep = useUtilaOrderStep(orderTitle);
  const isStepInProgress = status === SpotSwapStatus.LOADING;

  return (
    <div className="flex flex-col gap-4">
      <UtilaOrderSummary />
      {!isStepInProgress && (
        <>
          <UtilaOrderDetails orderTitle={orderTitle} />
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
        </>
      )}
      <UtilaStepProgress
        currentStep={currentStep}
        currentStepIndex={stepIndex}
        fallbackFooterText="Preparing order data and wallet permissions."
        fallbackTitle="Preparing order"
        isLoading={isStepInProgress}
        totalSteps={totalSteps}
      />
      <button
        className="flex h-11 w-full items-center justify-center rounded-[8px] bg-[#4564ff] text-[16px] font-semibold text-white disabled:bg-[#c9ccd6]"
        disabled={!disclaimerAccept || loading}
        onClick={onSubmit}
        type="button"
      >
        {loading ? "Creating..." : "Create Order"}
        {loading && <Spinner className="size-4" />}
      </button>
    </div>
  );
};

export const UtilaSubmitOrder = () => {
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
  const isCreatingOrder =
    status === SpotSwapStatus.LOADING || Boolean(confirmButtonLoading);
  const isOrderFailed = status === SpotSwapStatus.FAILED || Boolean(parsedError);

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
        {({ connect, loading: connectLoading, mounted, ready }) => (
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
      <DialogContent className="md:max-w-[570px] border-[#e3e5eb] bg-white text-[#3f4361]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-[#3f4361]">
            {`${orderTitle} order`}
          </DialogTitle>
        </DialogHeader>
        {status === SpotSwapStatus.SUCCESS ? (
          <UtilaOrderTerminalState
            onClose={() => onClose(false)}
            orderTitle={orderTitle}
            state="success"
          />
        ) : isOrderFailed ? (
          <UtilaOrderTerminalState
            message={parsedError?.message}
            onClose={() => onClose(false)}
            orderTitle={orderTitle}
            state="failed"
          />
        ) : (
          <UtilaOrderReview
            loading={isCreatingOrder}
            onSubmit={onSubmit}
            orderTitle={orderTitle}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

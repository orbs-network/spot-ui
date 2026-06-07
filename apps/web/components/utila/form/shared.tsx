"use client";

import React, { useEffect, useState } from "react";
import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import type { Step } from "@orbs-network/swap-ui";
import {
  CheckIcon,
  CircleXIcon,
  InfoIcon,
  ShieldIcon,
} from "lucide-react";
import { SwapType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export const SLIPPAGE_OPTIONS = [1, 3, 5, 7, 10];
export const SWAP_SLIPPAGE_OPTIONS = [0.1, 0.3, 0.5, 0.7, 1];
export const DEFAULT_SWAP_SLIPPAGE = 0.5;
export const TOKEN_BALANCE_PROBE_LIMIT = 64;
export const PRICE_PROTECTION_TOOLTIP =
  "The protocol uses an oracle price to help protect users from unfavorable executions. If the execution price is worse than the oracle price by more than the allowed percentage, the transaction will not be executed.";
export const QUOTE_FEE_USD_KEYS = [
  "protocolFeeUsd",
  "protocolFeesUsd",
  "feeUsd",
  "feesUsd",
  "partnerFeeUsd",
  "integratorFeeUsd",
] as const;

export const UTILA_SPOT_TABS = [
  { label: "Swap", value: SwapType.SWAP },
  { label: "TWAP", value: SwapType.TWAP },
  { label: "Limit", value: SwapType.LIMIT },
  { label: "Stop Loss", value: SwapType.STOP_LOSS },
  { label: "Take Profit", value: SwapType.TAKE_PROFIT },
] as const;

export const UTILA_WALLET_FOOTER_TEXT = "Proceed in the Utila mobile app";
export const UTILA_EXPLORER_FOOTER_TEXT = "View on explorer";

export const getQuoteField = (
  quote: Quote | undefined,
  keys: readonly string[],
) => {
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

export const useQuoteAgeLabel = (timestamp?: number) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timestamp) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(interval);
  }, [timestamp]);

  if (!timestamp) return "0s";

  return `${Math.max(0, Math.floor((now - timestamp) / 1_000))}s`;
};

export const UtilaNotice = () => {
  return (
    <div className="border-b border-[#ebecef] bg-[#f6f6f8]">
      <div className="mx-auto min-h-10 max-w-[1920px] px-3 py-2 text-[12px] font-medium leading-4 text-[#70748d] sm:px-8 sm:py-3 sm:text-[14px]">
        <p>
          <ShieldIcon className="mr-2 inline size-4 align-[-3px] text-[#4f5676]" />
          Swap and bridge functionality is powered by third-party providers,
          such as Liquidity Hub...{" "}
          <a
            className="font-semibold text-[#3f4361] hover:text-[#4564ff]"
            href="https://www.orbs.com/liquidity-hub/"
            rel="noreferrer"
            target="_blank"
          >
            Read more
          </a>
        </p>
      </div>
    </div>
  );
};

export const UtilaTabs = ({
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
              "h-7 min-w-0 cursor-pointer truncate whitespace-nowrap rounded-[8px] border border-transparent px-1 text-[11px] font-semibold text-[#747891] transition-colors sm:px-1.5 sm:text-[12px]",
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

export const UtilaCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-[#e7e8eb] bg-white p-3 sm:p-4",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const UtilaPanelLabel = ({
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

export const UtilaStepProgress = ({
  currentStep,
  currentStepIndex,
  fallbackFooterText,
  fallbackTitle,
  isLoading,
  totalSteps,
}: {
  currentStep?: Step;
  currentStepIndex?: number;
  fallbackFooterText: string;
  fallbackTitle: string;
  isLoading: boolean;
  totalSteps?: number;
}) => {
  if (!isLoading) return null;

  const stepNumber =
    totalSteps && currentStepIndex !== undefined
      ? Math.min(currentStepIndex + 1, totalSteps)
      : undefined;
  const title = currentStep?.title || fallbackTitle;
  const footerText = currentStep?.footerText || fallbackFooterText;

  return (
    <div className="rounded-[8px] border border-[#e3e5eb] bg-[#fbfbfd] p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#edefff]">
          <Spinner className="size-3.5 text-[#4564ff]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-semibold leading-5 text-[#3f4361]">
              {title}
            </p>
            {stepNumber && totalSteps ? (
              <p className="shrink-0 text-[12px] font-medium leading-5 text-[#70748d]">
                Step {stepNumber} of {totalSteps}
              </p>
            ) : null}
          </div>
          {currentStep?.footerLink ? (
            <a
              className="mt-0.5 block text-[12px] font-medium leading-4 text-[#4564ff]"
              href={currentStep.footerLink}
              rel="noopener noreferrer"
              target="_blank"
            >
              {footerText}
            </a>
          ) : (
            <p className="mt-0.5 text-[12px] font-medium leading-4 text-[#70748d]">
              {footerText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export type UtilaCompletedStep = Pick<
  Step,
  "footerLink" | "footerText" | "title"
>;

export type UtilaResultStep = UtilaCompletedStep & {
  message?: string;
  state: "success" | "failed" | "pending";
};

const UtilaStepResultIcon = ({
  index,
  state,
}: {
  index: number;
  state: UtilaResultStep["state"];
}) => {
  if (state === "failed") {
    return (
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#fff1f0] text-[#f04438]">
        <CircleXIcon className="size-3.5" />
      </span>
    );
  }

  if (state === "pending") {
    return (
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f1f2f6] text-[12px] font-bold text-[#85899d]">
        {index + 1}
      </span>
    );
  }

  return (
    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#eaf8f2] text-[#249064]">
      <CheckIcon className="size-3.5" />
    </span>
  );
};

export const getUtilaCompletedResultSteps = (
  steps: UtilaCompletedStep[],
): UtilaResultStep[] =>
  steps.map((step) => ({ ...step, state: "success" }));

export const getUtilaFailedResultSteps = ({
  failedStepIndex,
  message,
  steps,
}: {
  failedStepIndex?: number;
  message?: string;
  steps: UtilaCompletedStep[];
}): UtilaResultStep[] => {
  const resultSteps = steps.length ? steps : [{ title: "Transaction" }];
  const failedIndex = Math.min(
    Math.max(failedStepIndex ?? 0, 0),
    Math.max(resultSteps.length - 1, 0),
  );

  return resultSteps.map((step, index) => ({
    ...step,
    message:
      index === failedIndex ? message || "Transaction failed" : undefined,
    state:
      index < failedIndex
        ? "success"
        : index === failedIndex
          ? "failed"
          : "pending",
  }));
};

export const UtilaStepResultsCard = ({
  steps,
}: {
  steps: UtilaResultStep[];
}) => {
  return (
    <div className="rounded-[8px] border border-[#e3e5eb] bg-[#fbfbfd] p-3">
      <div className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <div
            className="flex items-start gap-3"
            key={`${step.title}-${index}`}
          >
            <UtilaStepResultIcon index={index} state={step.state} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] font-semibold leading-5 text-[#3f4361]">
                  {step.title}
                </p>
                <p className="shrink-0 text-[12px] font-medium leading-5 text-[#70748d]">
                  Step {index + 1} of {steps.length}
                </p>
              </div>
              {step.message ? (
                <p className="mt-0.5 max-h-[120px] overflow-y-auto whitespace-pre-wrap break-words text-[12px] font-medium leading-4 text-[#b42318]">
                  {step.message}
                </p>
              ) : step.footerLink ? (
                <a
                  className="mt-0.5 block text-[12px] font-medium leading-4 text-[#4564ff]"
                  href={step.footerLink}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {step.footerText}
                </a>
              ) : step.footerText ? (
                <p className="mt-0.5 text-[12px] font-medium leading-4 text-[#70748d]">
                  {step.footerText}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const UtilaStepResults = ({
  closeLabel = "Close",
  onClose,
  steps,
}: {
  closeLabel?: string;
  onClose: () => void;
  steps: UtilaResultStep[];
}) => {
  return (
    <div className="flex flex-col gap-4">
      <UtilaStepResultsCard steps={steps} />
      <button
        className="h-10 cursor-pointer rounded-[8px] bg-[#4564ff] text-[15px] font-semibold text-white transition-colors hover:bg-[#3152ff]"
        onClick={onClose}
        type="button"
      >
        {closeLabel}
      </button>
    </div>
  );
};

export const UtilaCompletedSteps = ({
  closeLabel = "Close",
  onClose,
  steps,
}: {
  closeLabel?: string;
  onClose: () => void;
  steps: UtilaCompletedStep[];
}) => (
  <UtilaStepResults
    closeLabel={closeLabel}
    onClose={onClose}
    steps={getUtilaCompletedResultSteps(steps)}
  />
);

export const UtilaFailedSteps = ({
  closeLabel = "Close",
  failedStepIndex,
  message,
  onClose,
  steps,
}: {
  closeLabel?: string;
  failedStepIndex?: number;
  message?: string;
  onClose: () => void;
  steps: UtilaCompletedStep[];
}) => {
  return (
    <UtilaStepResults
      closeLabel={closeLabel}
      onClose={onClose}
      steps={getUtilaFailedResultSteps({ failedStepIndex, message, steps })}
    />
  );
};

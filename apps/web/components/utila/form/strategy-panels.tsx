"use client";

import React, { useEffect, useState } from "react";
import BN from "bignumber.js";
import {
  Module,
  ORBS_TWAP_FAQ_URL,
  SPOT_VERSION,
  useSpot,
} from "@orbs-network/spot-react";
import type { Quote } from "@orbs-network/liquidity-hub-sdk";
import { ArrowLeftRightIcon, ClockIcon, InfoIcon } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SPOT_DURATION_OPTIONS,
  useSpotUiContext,
} from "@/components/spot/spot-ui-provider";
import { DEFAULT_PRICE_PROTECTION } from "@/lib/consts";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { useSettings } from "@/lib/hooks/use-settings";
import { useUSDPrice } from "@/lib/hooks/use-usd-price";
import { useTranslations } from "@/lib/use-translations";
import { cn, formatDecimals, toAmountUI } from "@/lib/utils";
import {
  DEFAULT_SWAP_SLIPPAGE,
  PRICE_PROTECTION_TOOLTIP,
  QUOTE_FEE_USD_KEYS,
  SLIPPAGE_OPTIONS,
  SWAP_SLIPPAGE_OPTIONS,
  UtilaCard,
  UtilaPanelLabel,
  getQuoteField,
  useQuoteAgeLabel,
} from "./shared";

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

export const UtilaPrices = () => {
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

export const UtilaModuleInputs = () => {
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

export const UtilaProtectionPanel = ({ isSwap }: { isSwap: boolean }) => {
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
    if (isSwap || priceProtection === DEFAULT_PRICE_PROTECTION) {
      return;
    }

    setPriceProtection(DEFAULT_PRICE_PROTECTION);
  }, [isSwap, priceProtection, setPriceProtection]);

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

export const UtilaAvailableQuotesPanel = () => {
  const {
    inputCurrency,
    outputCurrency,
    parsedInputAmount,
    trade,
  } = useDerivedSwap();
  const quote = trade?.originalQuote as Quote | undefined;
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
  const networkCostAmount = toAmountUI(
    quote?.gasAmountOut ?? trade?.gas,
    outputCurrency?.decimals,
  );
  const networkCostUsd = useUSDPrice({
    amount: networkCostAmount,
    disabled:
      !outputCurrency ||
      !networkCostAmount ||
      BN(networkCostAmount || "0").lte(0),
    token: outputCurrency?.address,
  });
  const showNetworkCost =
    Boolean(outputCurrency) && BN(networkCostAmount || "0").gt(0);

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
          {showNetworkCost && (
            <p className="flex flex-wrap items-center gap-1.5 font-normal">
              <span className="font-bold">Network cost:</span>
              <span>≈ ${networkCostUsd.formatted || "0"}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export const UtilaInputError = () => {
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

export const UtilaDisclaimer = () => {
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

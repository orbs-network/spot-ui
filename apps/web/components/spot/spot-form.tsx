"use client";
import React, {
  useCallback,
  useMemo,
  useState,
} from "react";
import { FormContainer } from "../form-container";
import {
  Module,
  DISCLAIMER_URL,
  useSpot,
  SPOT_VERSION,
  ORBS_TWAP_FAQ_URL,
  SwapStatus,
} from "@orbs-network/spot-react";
import { useFormatNumber } from "@/lib/hooks/common";
import { Field } from "@/lib/types";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { Button } from "../ui/button";
import { CurrencyCard } from "../currency-card";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { ToggleCurrencies } from "../toggle-currencies";
import { cn, formatDecimals, getOrderTitle } from "@/lib/utils";
import { NumericInput } from "../ui/numeric-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { AlertTriangleIcon, ArrowLeftRightIcon, InfoIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Switch } from "../ui/switch";
import { SubmitSwapButton } from "../submit-swap-button";
import { Portal } from "../ui/portal";
import {
  SpotPriceInput,
  SpotPriceResetButton,
  SpotSelectMenu,
} from "./components";
import {
  SPOT_DURATION_OPTIONS,
  SpotUiProvider,
  useSpotUiContext,
} from "./spot-ui-provider";
import { SpotsOrders } from "./orders";
import { SubmitOrderPanel } from "./submit-order-panel";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { SpotFooter } from "./footer";
import { useTranslations } from "@/lib/use-translations";

const TokenPanel = ({ isSrcToken }: { isSrcToken: boolean }) => {
  const { inputCurrency, outputCurrency, inputAmount } = useDerivedSwap();
  const { value: dstAmount, isLoading } = useSpot().dstTokenPanel;
  const { handleCurrencyChange, setInputAmount } = useActionHandlers();
  const onTokenChange = useCallback(
    (currency: string) => {
      if (isSrcToken) {
        handleCurrencyChange(currency, Field.INPUT);
      } else {
        handleCurrencyChange(currency, Field.OUTPUT);
      }
    },
    [handleCurrencyChange, isSrcToken],
  );

  return (
    <CurrencyCard
      currency={isSrcToken ? inputCurrency : outputCurrency}
      onCurrencyChange={onTokenChange}
      onAmountChange={isSrcToken ? setInputAmount : undefined}
      amount={isSrcToken ? inputAmount : formatDecimals(dstAmount, 6)}
      title={isSrcToken ? "From" : "To"}
      disabled={!isSrcToken}
      isLoading={!isSrcToken ? isLoading : false}
    />
  );
};

type TooltipProps = { tooltipText?: string; children?: React.ReactNode };

const TwapTooltip = (props: TooltipProps) => {
  if (!props.tooltipText) {
    return null;
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        {props.children || <InfoIcon className="size-4" />}
      </TooltipTrigger>
      <TooltipContent>{props.tooltipText}</TooltipContent>
    </Tooltip>
  );
};

const Label = ({ title, tooltip }: { title: string; tooltip?: string }) => {
  return (
    <div className="flex items-center gap-2">
      <p className="text-sm text-foreground/80 font-medium">{title}</p>
      {tooltip && <TwapTooltip tooltipText={tooltip} />}
    </div>
  );
};

const Card = ({
  children,
  title,
  className = "",
  tooltip,
  error,
  headerContent,
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
  tooltip?: string;
  error?: boolean;
  headerContent?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 bg-card p-4 rounded-lg group relative border border-transparent",
        className,
        error ? "border-destructive/80" : "",
      )}
    >
      {headerContent || (title && <Label title={title} tooltip={tooltip} />)}
      {children}
    </div>
  );
};

const DisclaimerPanel = () => {
  const t = useTranslations();
  const disclaimer = useSpot().disclaimerPanel;

  if (!disclaimer) {
    return null;
  }

  return (
    <div className="text-sm bg-card p-2 rounded-md flex flex-row gap-2">
      <InfoIcon className="size-4 text-muted-foreground relative top-0.5" />
      <p className="text-sm text-foreground/70 flex-1">
        {t(disclaimer)}{" "}
        <a
          href={ORBS_TWAP_FAQ_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary"
        >
          Learn more
        </a>
      </p>
    </div>
  );
};

const TradesPanel = () => {
  const t = useTranslations();
  const { totalTrades, onChange, error } = useSpot().tradesAmountPanel;
  const { srcToken } = useSpot().derivedFormData;

  const {
    totalTrades: tradesAmount,
    amountPerTradeUI,
    amountPerTradeUsd,
  } = useSpot().tradesAmountPanel;

  const amountPerChunkFormatted = useFormatNumber({ value: amountPerTradeUI });
  const amountPerChunkUsdFormatted = useFormatNumber({
    value: amountPerTradeUsd,
    decimalScale: 3,
  });
  const perTradeText = useMemo(() => {
    if (!srcToken || tradesAmount === 1) return "";
    return (
      <p className="text-[13px] text-foreground/80">
        {amountPerChunkFormatted} {srcToken?.symbol} per trade{" "}
        {amountPerChunkUsdFormatted && (
          <small className="text-foreground/50">
            (${amountPerChunkUsdFormatted})
          </small>
        )}
      </p>
    );
  }, [
    srcToken,
    tradesAmount,
    amountPerChunkFormatted,
    amountPerChunkUsdFormatted,
  ]);

  return (
    <Card
      title={t("tradesAmountTitle")}
      headerContent={
        <div className="flex flex-row gap-2 items-center justify-between">
          <Label
            title={t("tradesAmountTitle")}
            tooltip={t("totalTradesTooltip")}
          />
          {perTradeText}
        </div>
      }
      tooltip={t("totalTradesTooltip")}
      className="flex flex-col gap-2"
      error={Boolean(error)}
    >
      <div className="flex items-center gap-2">
        <NumericInput
          value={totalTrades ? totalTrades.toString() : ""}
          onChange={(it) => onChange(Number(it))}
        />
        <p className="text-sm text-muted-foreground">Trades</p>
      </div>
    </Card>
  );
};

const DurationPanel = () => {
  const t = useTranslations();
  const { duration, onInputChange, onUnitSelect } = useSpot().durationPanel;
  return (
    <Card
      title={t("expiry")}
      tooltip={t("maxDurationTooltip")}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <NumericInput
          value={duration.value ? duration.value.toString() : ""}
          onChange={(it) => onInputChange(it)}
        />
        <SpotSelectMenu
          selected={SPOT_DURATION_OPTIONS.find(
            (it) => it.value === duration.unit,
          )}
          items={SPOT_DURATION_OPTIONS}
          onSelect={(it) => onUnitSelect(it.value as number)}
        />
      </div>
    </Card>
  );
};

const FillDelayPanel = () => {
  const t = useTranslations();
  const { fillDelay, onInputChange, onUnitSelect } = useSpot().fillDelayPanel;
  return (
    <Card
      title={t("tradeIntervalTitle")}
      tooltip={t("tradeIntervalTooltip")}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <NumericInput
          value={fillDelay.value ? fillDelay.value.toString() : ""}
          onChange={(it) => onInputChange(it)}
        />
        <SpotSelectMenu
          selected={SPOT_DURATION_OPTIONS.find(
            (it) => it.value === fillDelay.unit,
          )}
          items={SPOT_DURATION_OPTIONS}
          onSelect={(it) => onUnitSelect(it.value as number)}
        />
      </div>
    </Card>
  );
};

const ModuleInputs = () => {
  const { swapModule } = useSpotUiContext();

  if (swapModule === Module.TWAP) {
    return (
      <>
        <TradesPanel />
        <FillDelayPanel />
      </>
    );
  }

  return <DurationPanel />;
};

const SubmitSwapError = ({
  code,
  onClose,
  message,
}: {
  message: string;
  code: number;
  onClose: () => void;
}) => {
  const { envMode } = useSwapParams();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 bg-destructive/50 p-2 rounded-md">
        <div className="flex flex-row gap-2">
          <AlertTriangleIcon className="size-4 text-foreground relative top-0.5" />
          <p className="text-sm text-foreground flex-1 font-medium">
            Error code: {code}
          </p>
        </div>
        {envMode === "dev" && (
          <p className="text-sm text-foreground flex-1 font-medium max-h-[200px] overflow-y-auto">
            {message}
          </p>
        )}
      </div>
      <div className="w-full flex justify-center">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
};

const SubmitSwapMain = ({
  onSubmitOrder,
  swapLoading,
  orderTitle,
}: {
  onSubmitOrder: () => void;
  swapLoading: boolean;
  orderTitle: string;
}) => {
  const [disclaimerAccept, setDisclaimerAccept] = useState(true);

  return (
    <SubmitOrderPanel
      orderTitle={orderTitle}
      reviewDetails={
        <>
          <div className="flex  gap-2 justify-between">
            <p className="text-sm">
              Accept{" "}
              <a
                href={DISCLAIMER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary"
              >
                Disclaimer
              </a>
            </p>
            <Switch
              checked={disclaimerAccept}
              onCheckedChange={setDisclaimerAccept}
            />
          </div>
          <Button
            disabled={!disclaimerAccept || swapLoading}
            onClick={onSubmitOrder}
            isLoading={swapLoading}
          >
            Create Order
          </Button>
        </>
      }
    />
  );
};

const SubmitSwap = () => {
  const { onSubmit, status, resetState,resetCurrentSwap, parsedError, confirmButtonLoading } =
    useSpot().orderExecutionPanel;
  const { setInputAmount } = useActionHandlers();

  const orderType = useSpot().derivedFormData.orderType;
  const orderTitle = getOrderTitle(orderType);
  const [isOpen, setIsOpen] = useState(false);

  const onOpen = useCallback(() => setIsOpen(true), []);

  const onClose = useCallback(() => {
    setIsOpen(false);
    if(status === SwapStatus.SUCCESS) {
      setInputAmount("");
      setTimeout(() => {
        resetState();
      }, 500);
    }
    else if (Boolean(status)) {
      setTimeout(() => {
        resetCurrentSwap();
      }, 500);
    }
  }, [resetState, resetCurrentSwap, setInputAmount, status]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <ShowSubmitSwapButton onClick={onOpen} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {parsedError
                ? "Error Creating Order"
                : !status
                  ? `${orderTitle} order`
                  : " "}
            </DialogTitle>
          </DialogHeader>
          {parsedError ? (
            <SubmitSwapError
              message={parsedError.message}
              code={parsedError.code}
              onClose={onClose}
            />
          ) : (
            <SubmitSwapMain
              onSubmitOrder={onSubmit}
              swapLoading={Boolean(confirmButtonLoading)}
              orderTitle={orderTitle}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const ShowSubmitSwapButton = ({ onClick }: { onClick: () => void }) => {
  const t = useTranslations();

  const { disabled, loading } = useSpot().submitOrderButton;

  const text = useMemo(() => {
    if (loading) {
      return t("fetchingQuote");
    }
    return t("placeOrder");
  }, [loading, t]);

  return (
    <SubmitSwapButton
      onClick={onClick}
      disabled={disabled}
      isLoading={loading}
      text={text}
    />
  );
};

const InputsErrorPanel = () => {
  const t = useTranslations();
  const error = useSpot().inputError;

  if (!error) {
    return null;
  }

  return (
    <div className="flex flex-row gap-2 bg-destructive/50 p-2 rounded-md">
      <AlertTriangleIcon className="size-4 text-foreground relative top-0.5" />
      <p className="text-sm text-foreground flex-1 font-medium">
        {t(error.type, error.args)}
      </p>
    </div>
  );
};

const LimitPricePanel = () => {
  const t = useTranslations();
  const {
    onInputChange: onChange,
    priceUI: price,
    percentage,
    onPercentageChange,
    isLimitPrice,
    toggleLimitPrice,
    onReset,
    isLoading,
    invertedDstToken: toToken,
    isTypedValue,
    usd,
  } = useSpot().limitPricePanel;

  const { swapModule } = useSpotUiContext();

  if (Number(SPOT_VERSION) < 2 && swapModule === Module.TAKE_PROFIT) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {swapModule !== Module.LIMIT && (
          <Switch checked={isLimitPrice} onCheckedChange={toggleLimitPrice} />
        )}
        <div className="flex justify-between w-full items-center">
          <Label title={t("limitPrice")} tooltip={t("limitPriceTooltip")} />
          {isLimitPrice && <SpotPriceResetButton onClick={onReset} />}
        </div>
      </div>
      {isLimitPrice && (
        <SpotPriceInput
          symbol={toToken?.symbol}
          value={isTypedValue ? price : formatDecimals(price, 6)}
          onChange={(it) => onChange(it)}
          percentage={percentage}
          onPercentageChange={(it) => onPercentageChange(it)}
          isLoading={isLoading}
          usd={usd}
        />
      )}
    </div>
  );
};

const TriggerPricePanel = () => {
  const t = useTranslations();
  const {
    priceUI: price,
    onInputChange: onChange,
    percentage,
    onPercentageChange,
    onReset,
    invertedDstToken: toToken,
    isTypedValue,
    usd
  } = useSpot().triggerPricePanel;

  const { swapModule } = useSpotUiContext();


  if (swapModule !== Module.TAKE_PROFIT && swapModule !== Module.STOP_LOSS) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 ">
      <div className="flex justify-between w-full items-center">
        <Label
          title={t("stopLossLabel")}
          tooltip={t(
            swapModule === Module.STOP_LOSS
              ? "stopLossTooltip"
              : "takeProfitTooltip",
          )}
        />
        <SpotPriceResetButton onClick={onReset} />
      </div>
      <SpotPriceInput
        symbol={toToken?.symbol}
        value={isTypedValue ? price : formatDecimals(price, 6)}
        onChange={(it) => onChange(it)}
        percentage={percentage}
        onPercentageChange={(it) => onPercentageChange(it)}
        usd={usd}
      />
    </div>
  );
};

const PricesHeader = () => {
  const { onInvert, isInverted, fromToken, isMarketPrice } =
    useSpot().pricePanel;
  return (
    <div className="flex flex-row gap-2 items-center justify-between">
      <p className="text-[15px] font-medium text-muted-foreground">
        {isInverted ? "Buy " : "Sell "}
        {fromToken?.symbol} {isMarketPrice ? "at best rate" : "at rate"}
      </p>

      {!isMarketPrice && (
        <Button
          variant="secondary"
          size="icon"
          onClick={onInvert}
          className="p-1"
        >
          <ArrowLeftRightIcon className="size-4" />
        </Button>
      )}
    </div>
  );
};

const Prices = () => {
  return (
    <Card className="flex flex-col gap-4">
      <PricesHeader />
      <TriggerPricePanel />
      <LimitPricePanel />
    </Card>
  );
};


export function SpotForm() {
  return (
    <SpotUiProvider>
      <FormContainer>
        <div className="flex flex-col gap-1">
          <div className="flex flex-col gap-0">
            <TokenPanel isSrcToken={true} />
            <ToggleCurrencies />
            <TokenPanel isSrcToken={false} />
          </div>
          <Prices />
          <ModuleInputs />
          <InputsErrorPanel />
          <SubmitSwap />
          <DisclaimerPanel />
        </div>
        <Portal containerId="spot-orders">
          <SpotsOrders />
        </Portal>
        <SpotFooter />
      </FormContainer>
    </SpotUiProvider>
  );
}

export const SpotOrders = () => {
  return <div id="spot-orders" className="w-full" />;
};

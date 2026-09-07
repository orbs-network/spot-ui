"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { FormContainer } from "../form-container";
import {
  Module,
  Token,
  SpotProvider as Spot,
  TimeUnit,
  DISCLAIMER_URL,
  SPOT_VERSION,
  ORBS_TWAP_FAQ_URL,
  ExecutionStatus,
  useDisclaimer,
  useDuration,
  useExecution,
  useFillDelay,
  useInputErrors,
  useLimitPrice,
  useOrderForm,
  useOutputAmount,
  usePriceDisplay,
  useSubmitButton,
  useTrades,
  useTriggerPrice,
  type ClientErrorFallbackProps,
} from "@orbs-network/spot-react";
import { useFormatNumber } from "@/lib/hooks/common";
import { Currency, Field, SwapType } from "@/lib/types";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { Button } from "../ui/button";
import { CurrencyCard } from "../currency-card";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { ToggleCurrencies } from "../toggle-currencies";
import { cn, formatDecimals, getOrderTitle } from "@/lib/utils";
import { NumericInput } from "../ui/numeric-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { AlertTriangleIcon, ArrowLeftRightIcon, InfoIcon } from "lucide-react";
import { useUSDPrice } from "@/lib/hooks/use-usd-price";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Switch } from "../ui/switch";
import { useConnection, useSwitchChain } from "wagmi";
import { SubmitSwapButton } from "../submit-swap-button";
import { useBalance } from "@/lib/hooks/use-balances";
import { useSettings } from "@/lib/hooks/use-settings";
import { Portal } from "../ui/portal";
import {
  useCallbacks,
  useSpotMarketReferencePrice,
  useSpotPartner,
  useWalletInteractions,
} from "@/lib/hooks/spot-hooks";
import {
  SpotPriceInput,
  SpotPriceResetButton,
  SpotSelectMenu,
} from "./components";
import { SpotsOrders } from "./orders";
import { SubmitOrderPanel } from "./submit-order-panel";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { SpotFooter } from "./footer";
import { useTranslations } from "@/lib/use-translations";
import { WrappedNativeButton } from "../wrapped-native-button";

const Context = createContext<{
  swapModule: Module;
  setInputAmount: (value: string) => void;
}>({
  swapModule: Module.TWAP,
  setInputAmount: () => {},
});

const useSpotContext = () => {
  return useContext(Context);
};

const DURATION_OPTIONS = [
  { text: "Minutes", value: TimeUnit.Minutes },
  { text: "Hours", value: TimeUnit.Hours },
  { text: "Days", value: TimeUnit.Days },
];

const useParseSpotTokens = (currency?: Currency) => {
  return useMemo((): Token | undefined => {
    if (!currency) return undefined;

    return {
      address: currency.address,
      decimals: currency.decimals,
      symbol: currency.symbol,
      logoUrl: currency.logoUrl,
    };
  }, [currency]);
};

const TokenPanel = ({ isInputToken }: { isInputToken: boolean }) => {
  const { inputCurrency, outputCurrency, inputAmount } = useDerivedSwap();
  const { amount: outputAmount, isLoading } = useOutputAmount();
  const { handleCurrencyChange, setInputAmount } = useActionHandlers();
  const onTokenChange = useCallback(
    (currency: string) => {
      if (isInputToken) {
        handleCurrencyChange(currency, Field.INPUT);
      } else {
        handleCurrencyChange(currency, Field.OUTPUT);
      }
    },
    [handleCurrencyChange, isInputToken],
  );

  return (
    <CurrencyCard
      currency={isInputToken ? inputCurrency : outputCurrency}
      onCurrencyChange={onTokenChange}
      onAmountChange={isInputToken ? setInputAmount : undefined}
      amount={
        isInputToken ? inputAmount : formatDecimals(outputAmount.ui, 6)
      }
      title={isInputToken ? "From" : "To"}
      disabled={!isInputToken}
      isLoading={!isInputToken ? isLoading : false}
    />
  );
};

const getModule = (swapType: SwapType) => {
  if (swapType === SwapType.TWAP) {
    return Module.TWAP;
  } else if (swapType === SwapType.LIMIT) {
    return Module.LIMIT;
  } else if (swapType === SwapType.STOP_LOSS) {
    return Module.STOP_LOSS;
  } else if (swapType === SwapType.TAKE_PROFIT) {
    return Module.TAKE_PROFIT;
  }
  return Module.TWAP;
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
  const disclaimer = useDisclaimer();

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
  const {
    totalTrades,
    onChange,
    error,
    inputAmountPerTrade,
    inputToken,
  } = useTrades();

  const amountPerTradeFormatted = useFormatNumber({
    value: inputAmountPerTrade.ui,
  });
  const amountPerTradeUsdFormatted = useFormatNumber({
    value: inputAmountPerTrade.usd,
    decimalScale: 3,
  });
  const perTradeText = useMemo(() => {
    if (!inputToken || totalTrades === 1) return "";
    return (
      <p className="text-[13px] text-foreground/80">
        {amountPerTradeFormatted} {inputToken.symbol} per trade{" "}
        {amountPerTradeUsdFormatted && (
          <small className="text-foreground/50">
            (${amountPerTradeUsdFormatted})
          </small>
        )}
      </p>
    );
  }, [
    inputToken,
    totalTrades,
    amountPerTradeFormatted,
    amountPerTradeUsdFormatted,
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
  const { duration, onInputChange, onUnitSelect } =
    useDuration();
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
          selected={DURATION_OPTIONS.find((it) => it.value === duration.unit)}
          items={DURATION_OPTIONS}
          onSelect={(it) => onUnitSelect(it.value as number)}
        />
      </div>
    </Card>
  );
};

const FillDelayPanel = () => {
  const t = useTranslations();
  const { fillDelay, onInputChange, onUnitSelect } =
    useFillDelay();
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
          selected={DURATION_OPTIONS.find((it) => it.value === fillDelay.unit)}
          items={DURATION_OPTIONS}
          onSelect={(it) => onUnitSelect(it.value as number)}
        />
      </div>
    </Card>
  );
};

const ModuleInputs = () => {
  const { swapModule } = useSpotContext();

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
}: {
  code: number;
  onClose: () => void;
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 bg-destructive/50 p-2 rounded-md">
        <div className="flex flex-row gap-2">
          <AlertTriangleIcon className="size-4 text-foreground relative top-0.5" />
          <p className="text-sm text-foreground flex-1 font-medium">
            Error code: {code}
          </p>
        </div>
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
            aria-label={swapLoading ? "Checking allowance" : undefined}
          >
            {!swapLoading && "Create Order"}
          </Button>
        </>
      }
    />
  );
};

const SubmitSwap = () => {
  const {
    submitOrder,
    status,
    startNewOrder,
    returnToOrderForm,
    error,
    isPreparingOrder,
    isExecuting,
  } = useExecution();
  const { setInputAmount } = useSpotContext();

  const orderType = useOrderForm().values.orderType;
  const orderTitle = getOrderTitle(orderType);
  const [isOpen, setIsOpen] = useState(false);

  const onOpen = useCallback(() => setIsOpen(true), []);

  const onClose = useCallback(() => {
    if (isExecuting) return;
    setIsOpen(false);
    if(status === ExecutionStatus.SUCCESS) {
      setInputAmount("");
      setTimeout(() => {
        startNewOrder();
      }, 500);
    }
    else if (Boolean(status)) {
      setTimeout(() => {
        returnToOrderForm();
      }, 500);
    }
  }, [
    isExecuting,
    returnToOrderForm,
    setInputAmount,
    startNewOrder,
    status,
  ]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <ShowSubmitSwapButton onClick={onOpen} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {error
                ? "Error Creating Order"
                : !status || isPreparingOrder
                  ? `${orderTitle} order`
                  : " "}
            </DialogTitle>
          </DialogHeader>
          {error ? (
            <SubmitSwapError
              code={error.code}
              onClose={onClose}
            />
          ) : (
            <SubmitSwapMain
              onSubmitOrder={submitOrder}
              swapLoading={Boolean(isPreparingOrder)}
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
  const { partner } = useSwapParams();

  const { disabled, loading } = useSubmitButton();

  const partnerChainId = useMemo(() => {
    const partnerChain = partner?.split("_")[1];
    return partnerChain ? Number(partnerChain) : undefined;
  }, [partner]);

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
      chainId={partnerChainId}
    />
  );
};

const InputsErrorPanel = () => {
  const t = useTranslations();
  const error = useInputErrors();

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
    price,
    percentage,
    onPercentageChange,
    isEnabled,
    toggle,
    onReset,
    isLoading,
    displayOutputToken,
    isTypedValue,
  } = useLimitPrice();

  const { swapModule } = useSpotContext();

  if (Number(SPOT_VERSION) < 2 && swapModule === Module.TAKE_PROFIT) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {swapModule !== Module.LIMIT && (
          <Switch checked={isEnabled} onCheckedChange={toggle} />
        )}
        <div className="flex justify-between w-full items-center">
          <Label title={t("limitPrice")} tooltip={t("limitPriceTooltip")} />
          {isEnabled && <SpotPriceResetButton onClick={onReset} />}
        </div>
      </div>
      {isEnabled && (
        <SpotPriceInput
          symbol={displayOutputToken?.symbol}
          value={isTypedValue ? price.ui : formatDecimals(price.ui, 6)}
          onChange={(it) => onChange(it)}
          percentage={percentage}
          onPercentageChange={(it) => onPercentageChange(it)}
          isLoading={isLoading}
          usd={price.usd}
        />
      )}
    </div>
  );
};

const TriggerPricePanel = () => {
  const t = useTranslations();
  const {
    price,
    onInputChange: onChange,
    percentage,
    onPercentageChange,
    onReset,
    displayOutputToken,
    isTypedValue,
  } = useTriggerPrice();

  const { swapModule } = useSpotContext();


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
        symbol={displayOutputToken?.symbol}
        value={isTypedValue ? price.ui : formatDecimals(price.ui, 6)}
        onChange={(it) => onChange(it)}
        percentage={percentage}
        onPercentageChange={(it) => onPercentageChange(it)}
        usd={price.usd}
      />
    </div>
  );
};

const PricesHeader = () => {
  const { onInvert, isInverted, displayInputToken, isMarketOrder } =
    usePriceDisplay();
  return (
    <div className="flex flex-row gap-2 items-center justify-between">
      <p className="text-[15px] font-medium text-muted-foreground">
        {isInverted ? "Buy " : "Sell "}
        {displayInputToken?.symbol}{" "}
        {isMarketOrder ? "at best rate" : "at rate"}
      </p>

      {!isMarketOrder && (
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


const Listener = () => {
  const { chainId } = useConnection();
  const { targetChainId } = useSwapParams();
  const switchChain = useSwitchChain();

  useEffect(() => {
    if (chainId && targetChainId && chainId !== Number(targetChainId)) {
      switchChain.mutate({ chainId: Number(targetChainId) });
    }
  }, [targetChainId, chainId, switchChain]);


  return null;
};

const ClientErrorFallback = ({
  retry,
  isRetrying,
}: ClientErrorFallbackProps) => {
  const t = useTranslations();

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg bg-card p-4"
    >
      <p className="text-sm font-medium">{t("orderConfigurationError")}</p>
      <Button
        type="button"
        onClick={() => void retry()}
        isLoading={isRetrying}
      >
        {t("retryOrderConfiguration")}
      </Button>
    </div>
  );
};

export function SpotForm({ swapType }: { swapType: SwapType }) {
  const {
    inputCurrency,
    outputCurrency,
    inputAmount,
    wrappedNativeAction,
  } = useDerivedSwap();
  const { setInputAmount } = useActionHandlers();
  const { chainId, address } = useConnection();
  const { priceProtection } = useSettings();
  const swapModule = useMemo(() => getModule(swapType), [swapType]);
  const callbacks = useCallbacks();
  const partner = useSpotPartner();
  const supportLegacyOrders = true;
  const walletInteractions = useWalletInteractions();
  const inputUsd = useUSDPrice({
    token: inputCurrency?.address,
  });
  const outputUsd = useUSDPrice({
    token: outputCurrency?.address,
  });

  const { wei: inputBalance } = useBalance(inputCurrency);

  return (
    <Context.Provider value={{ swapModule, setInputAmount }}>
      <FormContainer>
        <Spot
          chainId={chainId}
          typedInputAmount={inputAmount}
          walletInteractions={walletInteractions}
          account={address}
          partner={partner}
          appId="orbs-spot-ui"
          inputBalance={inputBalance}
          inputToken={useParseSpotTokens(inputCurrency)}
          outputToken={useParseSpotTokens(outputCurrency)}
          priceProtection={priceProtection}
          module={swapModule}
          inputUsd1Token={inputUsd.data.toString()}
          outputUsd1Token={outputUsd.data.toString()}
          marketReferencePrice={useSpotMarketReferencePrice()}
          minTradeSizeUsd={1}
          callbacks={callbacks}
          supportLegacyOrders={supportLegacyOrders}
          clientErrorFallback={ClientErrorFallback}
          displayFeePercent={0.25}
        >
          <div className="flex flex-col gap-1">
            <div className="flex flex-col gap-0">
              <TokenPanel isInputToken={true} />
              <ToggleCurrencies />
              <TokenPanel isInputToken={false} />
            </div>
            {wrappedNativeAction ? (
              <WrappedNativeButton action={wrappedNativeAction} />
            ) : (
              <>
                <Prices />
                <ModuleInputs />
                <InputsErrorPanel />
                <SubmitSwap />
                <DisclaimerPanel />
              </>
            )}
          </div>
          <Portal containerId="spot-orders">
            <SpotsOrders />
          </Portal>
          <SpotFooter />
        </Spot>
        <Listener />
      </FormContainer>
    </Context.Provider>
  );
}

export const SpotOrders = () => {
  return <div id="spot-orders" className="w-full" />;
};

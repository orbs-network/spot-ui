"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { FormContainer } from "../form-container";
import {
  ButtonProps,
  Module,
  Token,
  SpotProvider as Spot,
  useDstTokenPanel,
  useDurationPanel,
  useTradesPanel,
  DEFAULT_DURATION_OPTIONS,
  useFillDelayPanel,
  useSubmitOrderPanel,
  Components,
  DISCLAIMER_URL,
  TooltipProps,
  useInputErrors,
  TokenLogoProps,
  useDisclaimerPanel,
  useLimitPricePanel,
  useTriggerPricePanel,
  useInvertTradePanel,
  useSubmitOrderButton,
} from "@orbs-network/spot-react";
import { Currency, Field, SwapType } from "@/lib/types";
import { useDerivedSwap } from "@/lib/hooks/use-derived-swap";
import { Button } from "../ui/button";
import { CurrencyCard } from "../currency-card";
import { useActionHandlers } from "@/lib/hooks/use-action-handlers";
import { ToggleCurrencies } from "../toggle-currencies";
import { cn } from "@/lib/utils";
import { NumericInput } from "../ui/numeric-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { AlertTriangleIcon, ArrowLeftRightIcon, InfoIcon } from "lucide-react";
import { useUSDPrice } from "@/lib/hooks/use-usd-price";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Switch } from "../ui/switch";
import { useConnection, useWalletClient } from "wagmi";
import { SubmitSwapButton } from "../submit-swap-button";
import {
  useBalance,
  useRefetchSelectedCurrenciesBalances,
} from "@/lib/hooks/use-balances";
import { Avatar, AvatarImage } from "../ui/avatar";
import { useSettings } from "@/lib/hooks/use-settings";
import { Portal } from "../ui/portal";
import { Spinner } from "../ui/spinner";
import {
  SpotHooks,
  useSpotMarketReferencePrice,
  useSpotPartner,
  useSpotToken,
} from "@/lib/hooks/spot-hooks";
import {
  SpotPriceInput,
  SpotPriceResetButton,
  SpotSelectMenu,
} from "./components";
import { SpotsOrders } from "./orders";
import { useSwapParams } from "@/lib/hooks/use-swap-params";
import { SpotFooter } from "./footer";

const { useCallbacks } = SpotHooks;
const Context = createContext<{
  swapModule: Module;
}>({
  swapModule: Module.TWAP,
});

const useSpotContext = () => {
  return useContext(Context);
};

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

const TwapButton = (props: ButtonProps) => {
  return (
    <Button isLoading={props.loading} onClick={props.onClick}>
      {props.children}
    </Button>
  );
};

const TokenPanel = ({ isSrcToken }: { isSrcToken: boolean }) => {
  const { inputCurrency, outputCurrency, inputAmount } =
    useDerivedSwap();
  const {value: dstAmount, isLoading} = useDstTokenPanel();
  const { handleCurrencyChange, setInputAmount } = useActionHandlers();
  const onTokenChange = useCallback(
    (currency: string) => {
      if (isSrcToken) {
        handleCurrencyChange(currency, Field.INPUT);
      } else {
        handleCurrencyChange(currency, Field.OUTPUT);
      }
    },
    [handleCurrencyChange, isSrcToken]
  );

  return (
    <CurrencyCard
      currency={isSrcToken ? inputCurrency : outputCurrency}
      onCurrencyChange={onTokenChange}
      onAmountChange={isSrcToken ? setInputAmount : undefined}
      amount={isSrcToken ? inputAmount : dstAmount}
      title={isSrcToken ? "From" : "To"}
      disabled={!isSrcToken}
      isLoading={!isSrcToken ? isLoading : false}
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
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
  tooltip?: string;
  error?: boolean;
}) => {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 bg-card p-4 rounded-lg group relative border border-transparent",
        className,
        error ? "border-destructive/80" : ""
      )}
    >
      {title && <Label title={title} tooltip={tooltip} />}
      {children}
    </div>
  );
};

const Disclaimer = () => {
  const message = useDisclaimerPanel();

  if (!message) {
    return null;
  }

  return (
    <div className="text-sm bg-card p-2 rounded-md flex flex-row gap-2">
      <InfoIcon className="size-4 text-muted-foreground relative top-0.5" />
      <p className="text-sm text-foreground/70 flex-1">
        {message.text}{" "}
        <a
          href={message.url}
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
  const { totalTrades, onChange, label, tooltip, error } = useTradesPanel();
  return (
    <Card
      title={label}
      tooltip={tooltip}
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
  const { duration, onInputChange, onUnitSelect, label, tooltip } =
    useDurationPanel();
  return (
    <Card title={label} tooltip={tooltip} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <NumericInput
          value={duration.value ? duration.value.toString() : ""}
          onChange={(it) => onInputChange(it)}
        />
        <SpotSelectMenu
          selected={DEFAULT_DURATION_OPTIONS.find(
            (it) => it.value === duration.unit
          )}
          items={DEFAULT_DURATION_OPTIONS}
          onSelect={(it) => onUnitSelect(it.value as number)}
        />
      </div>
    </Card>
  );
};

const FillDelayPanel = () => {
  const { fillDelay, onInputChange, onUnitSelect, label, tooltip } =
    useFillDelayPanel();
  return (
    <Card title={label} tooltip={tooltip} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <NumericInput
          value={fillDelay.value ? fillDelay.value.toString() : ""}
          onChange={(it) => onInputChange(it)}
        />
        <SpotSelectMenu
          selected={DEFAULT_DURATION_OPTIONS.find(
            (it) => it.value === fillDelay.unit
          )}
          items={DEFAULT_DURATION_OPTIONS}
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

const TokenLogo = ({ token }: TokenLogoProps) => {
  return (
    <Avatar className="size-10 twap-token-logo">
      <AvatarImage src={token?.logoUrl ?? ""} />
    </Avatar>
  );
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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 bg-destructive/50 p-2 rounded-md">
        <div className="flex flex-row gap-2">
          <AlertTriangleIcon className="size-4 text-foreground relative top-0.5" />
          <p className="text-sm text-foreground flex-1 font-medium">
            Error code: {code}
          </p>
        </div>
        {process.env.NEXT_PUBLIC_MODE === "dev" && (
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
}: {
  onSubmitOrder: () => void;
  swapLoading: boolean;
}) => {
  const [disclaimerAccept, setDisclaimerAccept] = useState(true);

  return (
    <Components.SubmitOrderPanel
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
  const { onSubmit, onOpenModal, onCloseModal, isLoading, parsedError } =
    useSubmitOrderPanel();
  const [isOpen, setIsOpen] = useState(false);

  const onOpen = useCallback(() => {
    setIsOpen(true);
    onOpenModal();
  }, [onOpenModal]);

  const onClose = useCallback(() => {
    setIsOpen(false);
    onCloseModal();
  }, [onCloseModal]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <ShowSubmitSwapButton onClick={onOpen} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {parsedError ? "Error Creating Order" : "Submit Swap"}
            </DialogTitle>
          </DialogHeader>
          {parsedError ? (
            <SubmitSwapError
              message={parsedError.message}
              code={parsedError.code}
              onClose={onClose}
            />
          ) : (
            <SubmitSwapMain onSubmitOrder={onSubmit} swapLoading={isLoading} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const ShowSubmitSwapButton = ({ onClick }: { onClick: () => void }) => {
  const { partner } = useSwapParams();

  const { disabled, text, loading } = useSubmitOrderButton();

  const partnerChainId = useMemo(() => {
    const partnerChain = partner?.split("_")[1];
    return partnerChain ? Number(partnerChain) : undefined;
  }, [partner]);

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
  const error = useInputErrors();

  if (!error) {
    return null;
  }

  return (
    <div className="flex flex-row gap-2 bg-destructive/50 p-2 rounded-md">
      <AlertTriangleIcon className="size-4 text-foreground relative top-0.5" />
      <p className="text-sm text-foreground flex-1 font-medium">
        {error.message}
      </p>
    </div>
  );
};

const LimitPricePanel = () => {
  const {
    toToken,
    onChange,
    price,
    percentage,
    onPercentageChange,
    usd,
    isLimitPrice,
    toggleLimitPrice,
    label,
    tooltip,
    onReset,
    isLoading,
  } = useLimitPricePanel();

  const { swapModule } = useSpotContext();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {swapModule !== Module.LIMIT && (
          <Switch checked={isLimitPrice} onCheckedChange={toggleLimitPrice} />
        )}
        <div className="flex justify-between w-full items-center">
          <Label title={label} tooltip={tooltip} />
          {isLimitPrice && <SpotPriceResetButton onClick={onReset} />}
        </div>
      </div>
      {isLimitPrice && (
        <SpotPriceInput
          usd={usd}
          symbol={toToken?.symbol}
          value={price}
          onChange={(it) => onChange(it)}
          percentage={percentage}
          onPercentageChange={(it) => onPercentageChange(it)}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

const TriggerPricePanel = () => {
  const {
    price,
    onChange,
    percentage,
    onPercentageChange,
    usd,
    label,
    tooltip,
    onReset,
    toToken,
  } = useTriggerPricePanel();

  const { swapModule } = useSpotContext();

  if (swapModule !== Module.TAKE_PROFIT && swapModule !== Module.STOP_LOSS) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between w-full items-center">
        <Label title={label} tooltip={tooltip} />
        <SpotPriceResetButton onClick={onReset} />
      </div>
      <SpotPriceInput
        usd={usd}
        symbol={toToken?.symbol}
        value={price}
        onChange={(it) => onChange(it)}
        percentage={percentage}
        onPercentageChange={(it) => onPercentageChange(it)}
      />
    </div>
  );
};

const PricesHeader = () => {
  const { onInvert, isInverted, fromToken, isMarketPrice } =
    useInvertTradePanel();
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

export function SpotForm({ swapType }: { swapType: SwapType }) {
  const { inputCurrency, outputCurrency, inputAmount, } = useDerivedSwap();
  const { setInputAmount } = useActionHandlers();
  const { chainId, address } = useConnection();
  const { priceProtection } = useSettings();
  const swapModule = useMemo(() => getModule(swapType), [swapType]);
  const callbacks = useCallbacks();
  const partner = useSpotPartner();
  const { mutateAsync: refetchBalances } =
    useRefetchSelectedCurrenciesBalances();

  const inputUsd = useUSDPrice({
    token: inputCurrency?.address,
  });
  const outputUsd = useUSDPrice({
    token: outputCurrency?.address,
  });

  const { wei: inputBalance } = useBalance(inputCurrency);
  const { wei: outputBalance } = useBalance(outputCurrency);

  return (
    <Context.Provider value={{ swapModule }}>
      <FormContainer>
        <Spot
          chainId={chainId}
          typedInputAmount={inputAmount}
          resetTypedInputAmount={() => setInputAmount("")}
          provider={useWalletClient().data?.transport}
          account={address}
          partner={partner}
          srcBalance={inputBalance}
          dstBalance={outputBalance}
          srcToken={useParseSpotTokens(inputCurrency)}
          dstToken={useParseSpotTokens(outputCurrency)}
          priceProtection={priceProtection}
          module={swapModule}
          srcUsd1Token={inputUsd.data.toString()}
          dstUsd1Token={outputUsd.data.toString()}
          marketReferencePrice={useSpotMarketReferencePrice()}
          minChunkSizeUsd={5}
          refetchBalances={refetchBalances}
          useToken={useSpotToken}
          callbacks={callbacks}
          components={{
            Button: TwapButton,
            Tooltip: TwapTooltip,
            TokenLogo,
            Spinner: <Spinner className="size-18" />,
          }}
          fees={0.25}
        >
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
            <Disclaimer />
          </div>
          <Portal containerId="spot-orders">
            <SpotsOrders />
          </Portal>
        </Spot>
        <SpotFooter />
      </FormContainer>
    </Context.Provider>
  );
}

export const SpotOrders = () => {
  return <div id="spot-orders" className="w-full" />;
};

import {
  Module,
  SPOT_VERSION,
  useLimitPrice,
  usePriceDisplay,
  useTriggerPrice,
} from "@orbs-network/spot-react";
import { ArrowLeftRightIcon } from "lucide-react";
import { formatDecimals } from "@/lib/utils";
import { useTranslations } from "@/lib/use-translations";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  SpotPriceInput,
  SpotPriceResetButton,
} from "./components";
import { SpotFormCard, SpotFormLabel } from "./spot-form-card";
import { useSpotFormContext } from "./spot-form-context";

const LimitPricePanel = () => {
  const t = useTranslations();
  const {
    onInputChange,
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
  const { swapModule } = useSpotFormContext();

  if (Number(SPOT_VERSION) < 2 && swapModule === Module.TAKE_PROFIT) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {swapModule !== Module.LIMIT ? (
          <Switch checked={isEnabled} onCheckedChange={toggle} />
        ) : null}
        <div className="flex justify-between w-full items-center">
          <SpotFormLabel
            title={t("limitPrice")}
            tooltip={t("limitPriceTooltip")}
          />
          {isEnabled ? <SpotPriceResetButton onClick={onReset} /> : null}
        </div>
      </div>
      {isEnabled ? (
        <SpotPriceInput
          symbol={displayOutputToken?.symbol}
          value={isTypedValue ? price.ui : formatDecimals(price.ui, 6)}
          onChange={onInputChange}
          percentage={percentage}
          onPercentageChange={onPercentageChange}
          isLoading={isLoading}
          usd={price.usd}
        />
      ) : null}
    </div>
  );
};

const TriggerPricePanel = () => {
  const t = useTranslations();
  const {
    price,
    onInputChange,
    percentage,
    onPercentageChange,
    onReset,
    displayOutputToken,
    isTypedValue,
  } = useTriggerPrice();
  const { swapModule } = useSpotFormContext();

  if (swapModule !== Module.TAKE_PROFIT && swapModule !== Module.STOP_LOSS) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between w-full items-center">
        <SpotFormLabel
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
        onChange={onInputChange}
        percentage={percentage}
        onPercentageChange={onPercentageChange}
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
        {displayInputToken?.symbol} {isMarketOrder ? "at best rate" : "at rate"}
      </p>
      {!isMarketOrder ? (
        <Button
          variant="secondary"
          size="icon"
          onClick={onInvert}
          className="p-1"
        >
          <ArrowLeftRightIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  );
};

export const PriceSettings = () => (
  <SpotFormCard className="flex flex-col gap-4">
    <PricesHeader />
    <TriggerPricePanel />
    <LimitPricePanel />
  </SpotFormCard>
);

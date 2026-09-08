import {
  Module,
  TimeUnit,
  useDuration,
  useFillDelay,
  useTrades,
} from "@orbs-network/spot-react";
import { useFormatNumber } from "@/lib/hooks/common";
import { useTranslations } from "@/lib/use-translations";
import { NumericInput } from "../ui/numeric-input";
import { SpotSelectMenu } from "./components";
import { SpotFormCard, SpotFormLabel } from "./spot-form-card";
import { useSpotFormContext } from "./spot-form-context";

const DURATION_OPTIONS = [
  { text: "Minutes", value: TimeUnit.Minutes },
  { text: "Hours", value: TimeUnit.Hours },
  { text: "Days", value: TimeUnit.Days },
];

const DurationInput = ({
  value,
  unit,
  onInputChange,
  onUnitSelect,
}: {
  value: number;
  unit: TimeUnit;
  onInputChange: (value: string) => void;
  onUnitSelect: (unit: TimeUnit) => void;
}) => (
  <div className="flex items-center gap-2">
    <NumericInput
      value={value ? value.toString() : ""}
      onChange={onInputChange}
    />
    <SpotSelectMenu
      selected={DURATION_OPTIONS.find((option) => option.value === unit)}
      items={DURATION_OPTIONS}
      onSelect={(option) => onUnitSelect(option.value as TimeUnit)}
    />
  </div>
);

const TradesPanel = () => {
  const t = useTranslations();
  const { totalTrades, onChange, error, inputAmountPerTrade, inputToken } =
    useTrades();
  const amountPerTradeFormatted = useFormatNumber({
    value: inputAmountPerTrade.ui,
  });
  const amountPerTradeUsdFormatted = useFormatNumber({
    value: inputAmountPerTrade.usd,
    decimalScale: 3,
  });
  const perTradeText =
    inputToken && totalTrades !== 1 ? (
      <p className="text-[13px] text-foreground/80">
        {amountPerTradeFormatted} {inputToken.symbol} per trade{" "}
        {amountPerTradeUsdFormatted ? (
          <small className="text-foreground/50">
            (${amountPerTradeUsdFormatted})
          </small>
        ) : null}
      </p>
    ) : null;

  return (
    <SpotFormCard
      headerContent={
        <div className="flex flex-row gap-2 items-center justify-between">
          <SpotFormLabel
            title={t("tradesAmountTitle")}
            tooltip={t("totalTradesTooltip")}
          />
          {perTradeText}
        </div>
      }
      className="flex flex-col gap-2"
      error={Boolean(error)}
    >
      <div className="flex items-center gap-2">
        <NumericInput
          value={totalTrades ? totalTrades.toString() : ""}
          onChange={(value) => onChange(Number(value))}
        />
        <p className="text-sm text-muted-foreground">Trades</p>
      </div>
    </SpotFormCard>
  );
};

const DurationPanel = () => {
  const t = useTranslations();
  const { duration, onInputChange, onUnitSelect } = useDuration();
  return (
    <SpotFormCard
      title={t("expiry")}
      tooltip={t("maxDurationTooltip")}
      className="flex flex-col gap-2"
    >
      <DurationInput
        value={duration.value}
        unit={duration.unit}
        onInputChange={onInputChange}
        onUnitSelect={onUnitSelect}
      />
    </SpotFormCard>
  );
};

const FillDelayPanel = () => {
  const t = useTranslations();
  const { fillDelay, onInputChange, onUnitSelect } = useFillDelay();
  return (
    <SpotFormCard
      title={t("tradeIntervalTitle")}
      tooltip={t("tradeIntervalTooltip")}
      className="flex flex-col gap-2"
    >
      <DurationInput
        value={fillDelay.value}
        unit={fillDelay.unit}
        onInputChange={onInputChange}
        onUnitSelect={onUnitSelect}
      />
    </SpotFormCard>
  );
};

export const OrderSettings = () => {
  const { swapModule } = useSpotFormContext();

  if (swapModule !== Module.TWAP) return <DurationPanel />;
  return (
    <>
      <TradesPanel />
      <FillDelayPanel />
    </>
  );
};

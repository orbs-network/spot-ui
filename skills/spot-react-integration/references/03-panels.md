# Hook-Driven Panels

Every panel follows the same pattern: call a hook, render its `label` + `tooltip`, and wire its callbacks to DEX-styled inputs.

## Hooks Reference

| Hook | Key Returns |
|------|------------|
| `useDstTokenPanel()` | `value`, `usd`, `isLoading` |
| `useTradesPanel()` | `label`, `tooltip`, `totalTrades`, `onChange`, `error`, `amountPerTradeUsd` |
| `useDurationPanel()` | `label`, `tooltip`, `duration`, `onInputChange`, `onUnitSelect` |
| `useFillDelayPanel()` | `label`, `tooltip`, `fillDelay`, `onInputChange`, `onUnitSelect` |
| `useLimitPricePanel()` | `label`, `tooltip`, `price`, `percentage`, `isLimitPrice`, `toggleLimitPrice`, `onChange`, `onPercentageChange`, `onReset`, `toToken`, `usd` |
| `useTriggerPricePanel()` | `label`, `tooltip`, `price`, `percentage`, `hide`, `onChange`, `onPercentageChange`, `onReset`, `toToken`, `usd` |
| `useInvertTradePanel()` | `isInverted`, `onInvert`, `fromToken`, `isMarketPrice` |
| `useInputErrors()` | `{ type, message }` or `undefined` |
| `useSubmitOrderPanel()` | `onSubmit`, `onOpenModal`, `isSuccess`, `isLoading`, `step`, `parsedError` |
| `useSubmitOrderButton()` | `text`, `disabled`, `loading` |
| `useOrderHistoryPanel()` | `orders`, `selectedOrder`, `statuses`, `openOrdersCount`, `onSelectStatus`, `onHideSelectedOrder` |
| `usePartnerChains()` | Supported chain IDs |
| `useFormatNumber()` | Format number: `{ value, decimalScale, prefix, suffix }` |

## Form Structure

```tsx
function SpotFormContent({ module }) {
  return (
    <div className="flex flex-col gap-4">
      <ModuleTabs />
      <TokenInputsSection />
      <PriceConfigSection module={module} />
      {module !== Module.TWAP && <DurationSection />}
      {module === Module.TWAP && <TradeSizeSection />}
      {module === Module.TWAP && <TradeIntervalSection />}
      <ErrorSection />
      <SubmitOrderSection />
      <OrderHistorySection />
    </div>
  );
}
```

## Token Inputs

Use DEX components unchanged. Only pass `dstPanel.usd` if the component doesn't calculate USD itself:

```tsx
function TokenInputsSection() {
  const dstPanel = useDstTokenPanel();
  return (
    <>
      <CurrencyInputPanel value={inputValue} currency={inputCurrency} />
      <SwitchButton />
      <CurrencyInputPanel
        value={dstPanel.value}
        currency={outputCurrency}
        loading={dstPanel.isLoading}
      />
    </>
  );
}
```

## Label + Tooltip Pattern

All panels display label and tooltip from the hook:

```tsx
function LabelWithTooltip({ label, tooltip }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm font-medium">{label}</span>
      {tooltip && <Tooltip content={tooltip}><InfoIcon className="w-3.5 h-3.5" /></Tooltip>}
    </div>
  );
}
```

## Price Panels

```tsx
function PriceConfigSection({ module }) {
  const invertPanel = useInvertTradePanel();
  const triggerPanel = useTriggerPricePanel();
  const limitPanel = useLimitPricePanel();
  const showTrigger = module === Module.STOP_LOSS || module === Module.TAKE_PROFIT;

  return (
    <div>
      <PriceHeader invertPanel={invertPanel} />
      {showTrigger && !triggerPanel.hide && <TriggerPriceRow panel={triggerPanel} />}
      <LimitPriceRow panel={limitPanel} showToggle={module !== Module.LIMIT} />
    </div>
  );
}
```

Trigger and limit price rows each show: `[Symbol | Price + USD] [Percentage%]` with a Reset button.

For limit price, add a `Switch` toggle when `showToggle` is true (`isLimitPrice` / `toggleLimitPrice`).

## Duration Panel (Input + Select)

```tsx
import { TimeUnit } from "@orbs-network/spot-react";

function DurationSection() {
  const panel = useDurationPanel();
  return (
    <div>
      <LabelWithTooltip label={panel.label} tooltip={panel.tooltip} />
      <NumericInput value={panel.duration.value} onChange={panel.onInputChange} />
      <Select value={panel.duration.unit} onValueChange={panel.onUnitSelect}
        options={[
          { value: TimeUnit.Minutes, label: "Minutes" },
          { value: TimeUnit.Hours, label: "Hours" },
          { value: TimeUnit.Days, label: "Days" },
          { value: TimeUnit.Weeks, label: "Weeks" },
        ]}
      />
    </div>
  );
}
```

## Trade Size (TWAP only)

```tsx
function TradeSizeSection() {
  const panel = useTradesPanel();
  return (
    <div>
      <LabelWithTooltip label={panel.label} tooltip={panel.tooltip} />
      <NumericInput value={panel.totalTrades} onChange={panel.onChange} />
      {panel.amountPerTradeUsd && <span>${panel.amountPerTradeUsd} per trade</span>}
    </div>
  );
}
```

## Trade Interval (TWAP only)

```tsx
function TradeIntervalSection() {
  const panel = useFillDelayPanel();
  return (
    <div>
      <LabelWithTooltip label={panel.label} tooltip={panel.tooltip} />
      <NumericInput value={panel.fillDelay.value} onChange={panel.onInputChange} />
      <Select value={panel.fillDelay.unit} onValueChange={panel.onUnitSelect} options={unitOptions} />
    </div>
  );
}
```

## Submit Order

Render the form normally even without `chainId` or `account`. Only the submit area changes:

```tsx
function SubmitOrderSection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const partnerChains = usePartnerChains();
  const submitPanel = useSubmitOrderPanel();
  const submitButton = useSubmitOrderButton();

  if (!address) return <ConnectWalletButton />;
  if (chainId && !partnerChains.includes(chainId)) {
    return <SwitchNetworkButton targetChainId={partnerChains[0]} />;
  }

  return (
    <>
      <Button onClick={() => { submitPanel.onOpenModal(); setIsModalOpen(true); }}
        disabled={submitButton.disabled}>{submitButton.text}</Button>
      <SubmitOrderModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} submitPanel={submitPanel} />
    </>
  );
}
```

## Submit Modal

Use the same modal component DEX uses for token select or settings. Disclaimer + submit button go inside `reviewDetails`:

```tsx
function SubmitOrderModal({ isOpen, onClose, submitPanel }) {
  const [accepted, setAccepted] = useState(false);

  const reviewDetails = (
    <>
      <DisclaimerAccept accepted={accepted} onAcceptedChange={setAccepted} />
      <div className="flex gap-3 mt-4">
        <Button variant="outline" onClick={onClose} disabled={submitPanel.isLoading}>Cancel</Button>
        <Button onClick={submitPanel.onSubmit} disabled={!accepted || submitPanel.isLoading}>
          {submitPanel.isLoading ? "Confirming..." : "Confirm"}
        </Button>
      </div>
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <Components.SubmitOrderPanel reviewDetails={reviewDetails} />
      </DialogContent>
    </Dialog>
  );
}
```

## Order History

```tsx
function OrderHistorySection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const panel = useOrderHistoryPanel();
  return (
    <>
      <Button variant="outline" onClick={() => setIsModalOpen(true)}>
        Order History {panel.openOrdersCount > 0 && `(${panel.openOrdersCount})`}
      </Button>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <Components.Orders />
        </DialogContent>
      </Dialog>
    </>
  );
}
```

## Formatting Display Values

Use DEX's formatting or `useFormatNumber`:

```tsx
import { useFormatNumber } from "@orbs-network/spot-react";

const formattedUsd = useFormatNumber({ value: panel.usd, decimalScale: 2, prefix: "$" });
const formattedPercent = useFormatNumber({ value: panel.percentage, decimalScale: 2, suffix: "%" });
```

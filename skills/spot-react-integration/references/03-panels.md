# Hook-Driven Panels

Every panel follows the same pattern: call a hook, render its data, and wire its callbacks to DEX-styled inputs.

## Hooks Reference

| Hook | Key Returns |
|------|------------|
| `useDstTokenPanel()` | `value`, `usd`, `isLoading` |
| `useTradesPanel()` | `totalTrades`, `onChange`, `error`, `amountPerTradeUsd`, `fromToken`, `toToken` |
| `useDurationPanel()` | `duration`, `onInputChange`, `onUnitSelect`, `error` |
| `useFillDelayPanel()` | `fillDelay`, `onInputChange`, `onUnitSelect`, `error` |
| `useLimitPricePanel()` | `price`, `percentage`, `isLimitPrice`, `toggleLimitPrice`, `onChange`, `onPercentageChange`, `onReset`, `toToken`, `amountPerChunk`, `amountPerChunkUsd`, `isLoading`, `isInverted`, `fromToken`, `tradesAmount`, `isTypedValue` |
| `useTriggerPricePanel()` | `price`, `percentage`, `onChange`, `onPercentageChange`, `onReset`, `toToken`, `amountPerChunk`, `amountPerChunkUsd`, `isInverted`, `fromToken`, `totalTrades`, `isTypedValue` |
| `useInvertTradePanel()` | `isInverted`, `onInvert`, `fromToken`, `isMarketPrice` |
| `useInputErrors()` | error object or `undefined` |
| `useSubmitOrderPanel()` | `onSubmit`, `resetState`, `isSuccess`, `isLoading`, `isFailed`, `status`, `step`, `stepIndex`, `totalSteps`, `parsedError`, `srcToken`, `dstToken`, `srcAmount`, `dstAmount`, `wrapTxHash`, `approveTxHash`, `allowanceLoading`, `hasApproval`, `marketPrice`, `update` |
| `useSubmitOrderButton()` | `text`, `disabled`, `loading` |
| `useSwapExecution()` | Current swap execution state + `update(data)` function |
| `useDerivedOrder()` | Full derived order data for the current form state (amounts, prices, fees, rePermit data). Used in submit modal for order review details. |
| `useDerivedHistoryOrder(order, srcToken, dstToken)` | Derives display data for a historical order (fills, prices, progress). Used for order history display. |
| `useOrderHistoryPanel()` | `orders`, `isLoading` |
| `usePartnerChains()` | Supported chain IDs |
| `useFormatNumber()` | Format number: `{ value, decimalScale, prefix, suffix }` |
| `useDisclaimerPanel()` | Disclaimer state |

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
      {showTrigger && <TriggerPriceRow panel={triggerPanel} />}
      <LimitPriceRow panel={limitPanel} showToggle={module !== Module.LIMIT} />
    </div>
  );
}
```

Trigger and limit price rows each show: `[Symbol | Price + USD] [Percentage%]` with a Reset button.

For limit price, add a `Switch` toggle when `showToggle` is true (`isLimitPrice` / `toggleLimitPrice`).

Use `isTypedValue` to determine whether to show the raw typed value or `formatDecimals(price, 6)`.

The `amountPerChunk` and `amountPerChunkUsd` show per-trade amounts below the price input.

## Duration Panel (Input + Select)

```tsx
import { TimeUnit, DEFAULT_DURATIONS } from "@orbs-network/spot-react";

function DurationSection() {
  const panel = useDurationPanel();
  return (
    <div>
      <label>Expiry</label>
      <NumericInput value={panel.duration.value} onChange={panel.onInputChange} />
      <Select
        value={panel.duration.unit}
        onValueChange={panel.onUnitSelect}
        items={DEFAULT_DURATIONS}
      />
    </div>
  );
}
```

`DEFAULT_DURATIONS` provides `{ text, value }[]` options for Minutes, Hours, Days.

## Trade Size (TWAP only)

```tsx
function TradeSizeSection() {
  const panel = useTradesPanel();
  return (
    <div>
      <label>Trades</label>
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
      <label>Trade Interval</label>
      <NumericInput value={panel.fillDelay.value} onChange={panel.onInputChange} />
      <Select
        value={panel.fillDelay.unit}
        onValueChange={panel.onUnitSelect}
        items={DEFAULT_DURATIONS}
      />
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

  const onClose = useCallback(() => {
    setIsModalOpen(false);
    setTimeout(() => {
      submitPanel.resetState();
      if (submitPanel.isSuccess) {
        setInputAmount("");
      }
    }, 500);
  }, [submitPanel.resetState, submitPanel.isSuccess]);

  return (
    <>
      <Button onClick={() => setIsModalOpen(true)}
        disabled={submitButton.disabled}>{submitButton.text}</Button>
      <SubmitOrderModal isOpen={isModalOpen} onClose={onClose} submitPanel={submitPanel} />
    </>
  );
}
```

## Submit Modal

Build your own submit order UI using data from `useSubmitOrderPanel()` and `useDerivedOrder()`.

`useSubmitOrderPanel()` provides swap execution state:
- `srcToken`, `dstToken` — tokens (from context, locked during swap via swap execution)
- `srcAmount`, `dstAmount` — amounts (falls back to live values if no swap in progress)
- `status`, `step`, `stepIndex`, `totalSteps` — progress tracking
- `isLoading`, `isSuccess`, `isFailed` — status flags
- `wrapTxHash`, `approveTxHash` — transaction hashes for explorer links
- `allowanceLoading`, `hasApproval` — approval state
- `parsedError` — error details if failed
- `resetState()` — resets form and creates new swap execution

`useDerivedOrder()` provides full derived order details for the review screen:
- Amounts: `srcAmountUI`, `dstAmountUI`, `srcAmountUsd`, `dstAmountUsd`
- Prices: `limitPriceUI`, `triggerPriceUI`, `limitPriceUsd`, `triggerPriceUsd`
- Trade config: `totalTrades`, `sizePerTradeUI`, `minDestAmountPerTradeUI`
- Timing: `deadline`, `tradeInterval`
- Fees: `feesAmount`, `feesUsd`, `feesPercentage`

```tsx
function SubmitOrderModal({ isOpen, onClose, submitPanel }) {
  const [accepted, setAccepted] = useState(false);
  const order = useDerivedOrder();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        {submitPanel.parsedError ? (
          <ErrorDisplay error={submitPanel.parsedError} onClose={onClose} />
        ) : (
          <>
            {/* Order review details from useDerivedOrder() */}
            {!submitPanel.status && (
              <>
                <OrderReviewDetails order={order} srcToken={submitPanel.srcToken} dstToken={submitPanel.dstToken} />
                <DisclaimerAccept accepted={accepted} onAcceptedChange={setAccepted} />
                <Button onClick={submitPanel.onSubmit} disabled={!accepted || submitPanel.allowanceLoading}>
                  Create Order
                </Button>
              </>
            )}
            {/* Swap progress UI using submitPanel.status, step, stepIndex, totalSteps */}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

## Order History

Build your own order history UI using `useOrderHistoryPanel()` for the list and `useDerivedHistoryOrder()` for individual order display:

```tsx
function OrderHistorySection() {
  const panel = useOrderHistoryPanel();
  // panel.orders — array of raw Order objects
  // panel.isLoading — loading state
}

function OrderPreview({ order, srcToken, dstToken }) {
  const derived = useDerivedHistoryOrder(order, srcToken, dstToken);
  if (!derived) return null;
  // derived.srcAmountUI, derived.limitPriceUI, derived.fills, derived.progress, etc.
}
```

## Formatting Display Values

Use DEX's formatting or `useFormatNumber`:

```tsx
import { useFormatNumber } from "@orbs-network/spot-react";

const formattedUsd = useFormatNumber({ value: panel.usd, decimalScale: 2, prefix: "$" });
const formattedPercent = useFormatNumber({ value: panel.percentage, decimalScale: 2, suffix: "%" });
```

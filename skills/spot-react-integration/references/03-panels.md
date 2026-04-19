# Hook-Driven Panels

All panel data is accessed via the `useSpot()` hook. Each property returns a panel object with data and callbacks.

## useSpot() Reference

```tsx
import { useSpot } from "@orbs-network/spot-react";

const spot = useSpot();
```

| Panel | Key Returns |
|-------|------------|
| `spot.dstTokenPanel` | `value`, `isLoading` |
| `spot.tradesAmountPanel` | `totalTrades`, `onChange`, `error`, `amountPerTradeUI`, `amountPerTradeUsd`, `srcToken` |
| `spot.durationPanel` | `duration`, `onInputChange`, `onUnitSelect` |
| `spot.fillDelayPanel` | `fillDelay`, `onInputChange`, `onUnitSelect` |
| `spot.limitPricePanel` | `priceUI`, `percentage`, `isLimitPrice`, `toggleLimitPrice`, `onInputChange`, `onPercentageChange`, `onReset`, `invertedDstToken`, `isLoading`, `isTypedValue`, `usd` |
| `spot.triggerPricePanel` | `priceUI`, `percentage`, `onInputChange`, `onPercentageChange`, `onReset`, `invertedDstToken`, `isTypedValue`, `usd` |
| `spot.pricePanel` | `onInvert`, `isInverted`, `fromToken`, `isMarketPrice` |
| `spot.disclaimerPanel` | Disclaimer string key or `undefined` |
| `spot.inputError` | `{ type, args }` or `undefined` |
| `spot.submitOrderButton` | `disabled`, `loading` |
| `spot.orderExecutionPanel` | `onSubmit`, `status`, `onSwapSuccess`, `parsedError`, `confirmButtonLoading`, `step`, `stepIndex`, `totalSteps`, `srcToken`, `dstToken`, `wrapTxHash`, `approveTxHash` |
| `spot.orderHistoryPanel` | `orders: { all: Order[] }` |
| `spot.derivedFormData` | Computed: `srcAmountUI`, `dstAmountUI`, `srcAmountUsd`, `dstAmountUsd`, `limitPriceUI`, `triggerPriceUI`, `limitPriceUsd`, `triggerPriceUsd`, `totalTrades`, `sizePerTradeUI`, `minDestAmountPerTradeUI`, `minDestAmountPerTradeUsd`, `deadline`, `tradeInterval`, `feesAmount`, `feesAmountUI`, `feesUsd`, `feesPercentage`, `orderType` |
| `spot.supportedChains` | Partner's supported chain IDs |
| `spot.module` | Current `Module` enum |
| `spot.mutations` | `{ cancelOrder, signOrder, submitOrder, refetchUntilStatusSynced }` |

## Form Structure

```tsx
function SpotFormContent({ module }) {
  return (
    <div className="flex flex-col gap-4">
      <ModuleTabs />
      <TokenInputsSection />
      <PriceConfigSection />
      {module === Module.TWAP && <TradeSizeSection />}
      {module === Module.TWAP && <TradeIntervalSection />}
      {module !== Module.TWAP && <DurationSection />}
      <InputErrorPanel />
      <DisclaimerPanel />
      <SubmitOrderSection />
    </div>
  );
}
```

## Token Inputs

Use DEX components unchanged. Pass `dstTokenPanel.value` as the output amount:

```tsx
function TokenInputsSection() {
  const { value: dstAmount, isLoading } = useSpot().dstTokenPanel;
  return (
    <>
      <CurrencyInputPanel value={inputValue} currency={inputCurrency} />
      <SwitchButton />
      <CurrencyInputPanel
        value={dstAmount}
        currency={outputCurrency}
        loading={isLoading}
        disabled
      />
    </>
  );
}
```

## Price Panels

```tsx
function PriceConfigSection() {
  const { onInvert, isInverted, fromToken, isMarketPrice } = useSpot().pricePanel;
  const module = useSpot().module;
  const showTrigger = module === Module.STOP_LOSS || module === Module.TAKE_PROFIT;

  return (
    <div>
      <PriceHeader
        isInverted={isInverted}
        fromToken={fromToken}
        isMarketPrice={isMarketPrice}
        onInvert={onInvert}
      />
      {showTrigger && <TriggerPriceRow />}
      <LimitPriceRow showToggle={module !== Module.LIMIT} />
    </div>
  );
}
```

### Trigger Price (Stop-Loss / Take-Profit)

```tsx
function TriggerPriceRow() {
  const {
    priceUI, onInputChange, percentage, onPercentageChange,
    onReset, invertedDstToken, isTypedValue, usd,
  } = useSpot().triggerPricePanel;

  return (
    <div>
      <label>Trigger Price</label>
      <input
        value={isTypedValue ? priceUI : formatDecimals(priceUI, 6)}
        onChange={(e) => onInputChange(e.target.value)}
      />
      <span>{invertedDstToken?.symbol} ({percentage}%)</span>
      <span>${usd}</span>
      <button onClick={onReset}>Reset</button>
    </div>
  );
}
```

### Limit Price

```tsx
function LimitPriceRow({ showToggle }) {
  const {
    priceUI, onInputChange, percentage, onPercentageChange,
    isLimitPrice, toggleLimitPrice, onReset, invertedDstToken,
    isLoading, isTypedValue, usd,
  } = useSpot().limitPricePanel;

  return (
    <div>
      {showToggle && (
        <Switch checked={isLimitPrice} onCheckedChange={toggleLimitPrice} />
      )}
      <label>Limit Price</label>
      {isLimitPrice && (
        <>
          <input
            value={isTypedValue ? priceUI : formatDecimals(priceUI, 6)}
            onChange={(e) => onInputChange(e.target.value)}
          />
          <span>{invertedDstToken?.symbol} ({percentage}%)</span>
          <span>${usd}</span>
          <button onClick={onReset}>Reset</button>
        </>
      )}
    </div>
  );
}
```

## Duration Panel (Limit, Stop-Loss, Take-Profit)

```tsx
import { TimeUnit } from "@orbs-network/spot-react";

function DurationSection() {
  const { duration, onInputChange, onUnitSelect } = useSpot().durationPanel;
  return (
    <div>
      <label>Expiry</label>
      <NumericInput value={duration.value} onChange={onInputChange} />
      <Select
        value={duration.unit}
        onValueChange={onUnitSelect}
        items={[
          { text: "Minutes", value: TimeUnit.Minutes },
          { text: "Hours", value: TimeUnit.Hours },
          { text: "Days", value: TimeUnit.Days },
        ]}
      />
    </div>
  );
}
```

## Trades Amount (TWAP only)

```tsx
function TradeSizeSection() {
  const { totalTrades, onChange, error, amountPerTradeUI, amountPerTradeUsd, srcToken } =
    useSpot().tradesAmountPanel;

  return (
    <div>
      <label>Over</label>
      <NumericInput value={totalTrades} onChange={(v) => onChange(Number(v))} />
      {totalTrades > 1 && srcToken && (
        <p>{amountPerTradeUI} {srcToken.symbol} per trade (${amountPerTradeUsd})</p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

## Trade Interval (TWAP only)

```tsx
function TradeIntervalSection() {
  const { fillDelay, onInputChange, onUnitSelect } = useSpot().fillDelayPanel;
  return (
    <div>
      <label>Every</label>
      <NumericInput value={fillDelay.value} onChange={onInputChange} />
      <Select
        value={fillDelay.unit}
        onValueChange={onUnitSelect}
        items={[
          { text: "Minutes", value: TimeUnit.Minutes },
          { text: "Hours", value: TimeUnit.Hours },
          { text: "Days", value: TimeUnit.Days },
        ]}
      />
    </div>
  );
}
```

## Input Errors

```tsx
function InputErrorPanel() {
  const error = useSpot().inputError;
  if (!error) return null;

  // error.type is a translation key, error.args contains parameters
  // Use your i18n system: t(error.type, error.args)
  return <p className="error">{t(error.type, error.args)}</p>;
}
```

### Error keys reference:
- `enterAmount`, `insufficientFunds`, `emptyLimitPrice`, `emptyTriggerPrice`, `noLiquidity`
- `maxChunksError` (`{ maxChunks }`), `minChunksError` (`{ minChunks }`)
- `minTradeSizeError` (`{ minTradeSize }`), `maxOrderSizeError` (`{ maxOrderSize }`)
- `minDurationError` / `maxDurationError` (`{ duration }`)
- `minFillDelayError` / `maxFillDelayError` (`{ fillDelay }`)
- `StopLossTriggerPriceError`, `TakeProfitTriggerPriceError`, `triggerLimitPriceError`

## Disclaimer Panel

```tsx
function DisclaimerPanel() {
  const disclaimer = useSpot().disclaimerPanel;
  if (!disclaimer) return null;

  // disclaimer is a key: "limitOrderDisclaimer", "marketOrderDisclaimer",
  // or "triggerMarketPriceDisclaimer"
  return (
    <div>
      <p>{t(disclaimer)}</p>
      <a href={ORBS_TWAP_FAQ_URL} target="_blank">Learn more</a>
    </div>
  );
}
```

## Submit Order

Render the form normally even without `chainId` or `account`. Only the submit area changes:

```tsx
function SubmitOrderSection() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { disabled, loading } = useSpot().submitOrderButton;
  const { onSubmit, status, onSwapSuccess, parsedError, confirmButtonLoading } =
    useSpot().orderExecutionPanel;
  const supportedChains = useSpot().supportedChains;

  if (!address) return <ConnectWalletButton />;
  if (chainId && !supportedChains.includes(chainId)) {
    return <SwitchNetworkButton targetChainId={supportedChains[0]} />;
  }

  const onClose = useCallback(() => {
    setIsModalOpen(false);
    if (Boolean(status)) {
      setInputAmount("");
      setTimeout(() => { onSwapSuccess(); }, 500);
    }
  }, [onSwapSuccess, setInputAmount, status]);

  return (
    <>
      <Button onClick={() => setIsModalOpen(true)} disabled={disabled} isLoading={loading}>
        {loading ? "Fetching quote..." : "Place order"}
      </Button>
      <SubmitOrderModal isOpen={isModalOpen} onClose={onClose} />
    </>
  );
}
```

## Submit Modal

Build your submit order UI using `useSpot().orderExecutionPanel` for execution state and `useSpot().derivedFormData` for order review details.

### orderExecutionPanel provides:
- `onSubmit` — trigger the order creation flow
- `status` — SwapStatus (LOADING, SUCCESS, FAILED) or undefined
- `step` — current step: WRAP, APPROVE, CREATE
- `stepIndex` / `totalSteps` — progress tracking
- `parsedError` — `{ code, message }` on failure
- `onSwapSuccess()` — call after user acknowledges success
- `confirmButtonLoading` — loading state for the confirm button
- `srcToken`, `dstToken` — resolved tokens (after wrap if needed)
- `wrapTxHash`, `approveTxHash` — transaction hashes for explorer links

### derivedFormData provides:
- Amounts: `srcAmountUI`, `dstAmountUI`, `srcAmountUsd`, `dstAmountUsd`
- Prices: `limitPriceUI`, `triggerPriceUI`, `limitPriceUsd`, `triggerPriceUsd`
- Trade config: `totalTrades`, `sizePerTradeUI`, `minDestAmountPerTradeUI`, `minDestAmountPerTradeUsd`
- Timing: `deadline`, `tradeInterval`
- Fees: `feesAmount`, `feesAmountUI`, `feesUsd`, `feesPercentage`
- Type: `orderType`

```tsx
function SubmitOrderModal({ isOpen, onClose }) {
  const [accepted, setAccepted] = useState(false);
  const { onSubmit, status, parsedError, confirmButtonLoading, srcToken, dstToken } =
    useSpot().orderExecutionPanel;
  const form = useSpot().derivedFormData;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        {parsedError ? (
          <ErrorDisplay error={parsedError} onClose={onClose} />
        ) : (
          <>
            {!status && (
              <>
                {/* Order review details */}
                <p>Amount: {form.srcAmountUI} → {form.dstAmountUI}</p>
                {form.limitPriceUI && <p>Limit: {form.limitPriceUI}</p>}
                {form.triggerPriceUI && <p>Trigger: {form.triggerPriceUI}</p>}
                <p>Trades: {form.totalTrades}</p>
                <p>Deadline: {form.deadline}</p>
                {form.feesPercentage && <p>Fees: {form.feesPercentage}%</p>}

                <DisclaimerAccept accepted={accepted} onAcceptedChange={setAccepted} />
                <Button
                  onClick={onSubmit}
                  disabled={!accepted || Boolean(confirmButtonLoading)}
                  isLoading={confirmButtonLoading}
                >
                  Create Order
                </Button>
              </>
            )}
            {/* Swap progress UI when status is set */}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

## Order History

Build order history using `useSpot().orderHistoryPanel` for the list and `useDerivedHistoryOrder()` for individual order display:

```tsx
import { useDerivedHistoryOrder, OrderStatus } from "@orbs-network/spot-react";

function OrderHistorySection() {
  const { orders } = useSpot().orderHistoryPanel;
  const { mutateAsync: cancelOrder } = useSpot().mutations.cancelOrder;

  return (
    <div>
      <h3>Orders ({orders.all.length})</h3>
      {orders.all.map((order) => (
        <OrderPreview key={order.id} order={order} onCancel={cancelOrder} />
      ))}
    </div>
  );
}

function OrderPreview({ order, onCancel }) {
  const derived = useDerivedHistoryOrder(order);
  if (!derived) return null;

  return (
    <div>
      <p>#{order.id} — {order.status}</p>
      <p>{derived.srcAmountUI} → {derived.dstAmountUI}</p>
      {order.status === OrderStatus.Open && (
        <button onClick={() => onCancel({ orders: [order] })}>Cancel</button>
      )}
    </div>
  );
}
```

## Helper Hooks

```tsx
import { useExplorerLink, useNetwork, useAmountUi } from "@orbs-network/spot-react";

// Explorer URL for a transaction hash
const explorerUrl = useExplorerLink(txHash);

// Current network info (name, native token, wrapped token, explorer)
const network = useNetwork();

// Format wei amount to UI display
const formattedAmount = useAmountUi(amountWei, decimals);
```

## Utility Functions

```tsx
import {
  getPartners,        // () => all registered partners
  getPartnerChains,   // (partner) => supported chain IDs
  getNetwork,         // (chainId) => network config
  isNativeAddress,    // (address) => boolean
  eqIgnoreCase,       // (a, b) => case-insensitive address comparison
  getConfig,          // (partner, chainId) => SpotConfig
} from "@orbs-network/spot-react";
```

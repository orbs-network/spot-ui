# Hook-Driven Panels

All panel data is accessed via the `useSpot()` hook. Each property returns a panel object with data and callbacks.

The snippets below are intentionally framework-neutral. Replace placeholder components such as `CurrencyInputPanel`, `Select`, `Button`, `Dialog`, `ConnectWalletButton`, `SwitchNetworkButton`, and `DisclaimerAccept` with existing DEX components, and source variables such as `address`, `chainId`, `inputValue`, and `setInputAmount` from the DEX state/hooks.

## useSpot() Reference

```tsx
import { useSpot } from "@orbs-network/spot-react";

const spot = useSpot();
```

| Panel | Key Returns |
|-------|------------|
| `spot.dstTokenPanel` | `value`, `valueWei`, `isLoading`, `usd` |
| `spot.tradesAmountPanel` | `totalTrades`, `maxTrades`, `onChange`, `error`, `amountPerTradeUI`, `amountPerTrade`, `amountPerTradeUsd`, `fromToken`, `toToken` |
| `spot.durationPanel` | `duration`, `onInputChange`, `onUnitSelect`, `onChange`, `milliseconds`, `error` |
| `spot.fillDelayPanel` | `fillDelay`, `onInputChange`, `onUnitSelect`, `onChange`, `milliseconds`, `error` |
| `spot.limitPricePanel` | `price`, `priceUI`, `percentage`, `isLimitPrice`, `toggleLimitPrice`, `onInputChange`, `onPercentageChange`, `onReset`, `srcToken`, `dstToken`, `invertedSrcToken`, `invertedDstToken`, `isLoading`, `isTypedValue`, `usd`, `error` |
| `spot.triggerPricePanel` | `price`, `priceUI`, `percentage`, `onInputChange`, `onPercentageChange`, `onReset`, `srcToken`, `dstToken`, `invertedSrcToken`, `invertedDstToken`, `isLoading`, `isTypedValue`, `usd`, `amountPerChunk`, `amountPerChunkUI`, `amountPerChunkUsd`, `error` |
| `spot.pricePanel` | `onInvert`, `isInverted`, `fromToken`, `toToken`, `isMarketPrice` |
| `spot.disclaimerPanel` | Disclaimer string key or `undefined` |
| `spot.inputError` | `{ type, args }` or `undefined` |
| `spot.submitOrderButton` | `disabled`, `loading` |
| `spot.orderExecutionPanel` | `onSubmit`, `status`, `resetCurrentSwap`, `resetState`, `parsedError`, `error`, `confirmButtonLoading`, `isLoading`, `isSuccess`, `isFailed`, `step`, `stepIndex`, `totalSteps`, `pendingSteps`, `srcToken`, `dstToken`, `wrapTxHash`, `approveTxHash` |
| `spot.orderHistoryPanel` | `orders: { all, open, completed, cancelled, expired }`, `isLoading`, `isRefetching`, `refetchOrders` |
| `spot.derivedFormData` | Computed: `srcAmountUI`, `dstAmountUI`, `srcAmountUsd`, `dstAmountUsd`, `limitPriceUI`, `triggerPriceUI`, `limitPriceUsd`, `triggerPriceUsd`, `totalTrades`, `sizePerTradeUI`, `sizePerTradeUsd`, `minDestAmountPerTradeUI`, `minDestAmountPerTradeUsd`, `deadline`, `tradeInterval`, `feesAmount`, `feesAmountUI`, `feesUsd`, `feesPercentage`, `orderType`, `isMarketOrder`, `isTriggerPrice`, `marketPrice`, `marketPriceUi`, `spender`, `rePermitData` |
| `spot.supportedChains` | Partner's supported chain IDs |
| `spot.module` | Current `Module` enum |
| `spot.refetchUntilStatusSynced` | Polls order status after cancellation until synced |


Cancel orders use a separate `useCancelOrder` hook (see Cancel Order section below).

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

function PriceHeader({ isInverted, fromToken, isMarketPrice, onInvert }) {
  return (
    <div>
      <span>
        {isInverted ? "Buy" : "Sell"} {fromToken?.symbol}{" "}
        {isMarketPrice ? "at best rate" : "at rate"}
      </span>
      {!isMarketPrice && <button onClick={onInvert}>Invert</button>}
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
  const { totalTrades, onChange, error, amountPerTradeUI, amountPerTradeUsd, fromToken } =
    useSpot().tradesAmountPanel;

  return (
    <div>
      <label>Over</label>
      <NumericInput value={totalTrades} onChange={(v) => onChange(Number(v))} />
      {totalTrades > 1 && fromToken && (
        <p>{amountPerTradeUI} {fromToken.symbol} per trade (${amountPerTradeUsd})</p>
      )}
      {error && <p className="error">{t(error.type, error.args)}</p>}
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
  const { status, isSuccess, resetCurrentSwap, resetState } =
    useSpot().orderExecutionPanel;
  const supportedChains = useSpot().supportedChains;

  const onClose = useCallback(() => {
    setIsModalOpen(false);
    if (isSuccess) {
      setInputAmount("");
      setTimeout(() => {
        resetState();
      }, 500);
    } else if (Boolean(status)) {
      setTimeout(() => {
        resetCurrentSwap();
      }, 500);
    }
  }, [isSuccess, resetCurrentSwap, resetState, setInputAmount, status]);

  if (!address) return <ConnectWalletButton />;
  if (chainId && !supportedChains.includes(chainId)) {
    return <SwitchNetworkButton targetChainId={supportedChains[0]} />;
  }

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
- `isLoading`, `isSuccess`, `isFailed` — convenience boolean flags derived from `status`
- `step` — current step: WRAP, APPROVE, CREATE
- `stepIndex` / `totalSteps` — progress tracking
- `pendingSteps` — array of remaining steps
- `parsedError` — `{ code, message }` on failure
- `error` — raw Error object on failure
- `resetCurrentSwap()` — resets the current swap execution state
- `resetState()` — resets the full form state (store)
- `confirmButtonLoading` — loading state for the confirm button
- `srcToken`, `dstToken` — resolved tokens (after wrap if needed)
- `wrapTxHash`, `approveTxHash` — transaction hashes for explorer links

### derivedFormData provides:
- Amounts: `srcAmountUI`, `dstAmountUI`, `srcAmountUsd`, `dstAmountUsd`
- Prices: `limitPriceUI`, `triggerPriceUI`, `limitPriceUsd`, `triggerPriceUsd`, `marketPrice`, `marketPriceUi`
- Trade config: `totalTrades`, `sizePerTradeUI`, `sizePerTradeUsd`, `minDestAmountPerTradeUI`, `minDestAmountPerTradeUsd`
- Timing: `deadline`, `tradeInterval`
- Fees: `feesAmount`, `feesAmountUI`, `feesUsd`, `feesPercentage`
- Type: `orderType`, `isMarketOrder`, `isTriggerPrice`
- Other: `spender`, `rePermitData`

```tsx
function SubmitOrderModal({ isOpen, onClose }) {
  const [accepted, setAccepted] = useState(false);
  const { onSubmit, status, isLoading, isSuccess, isFailed, parsedError, confirmButtonLoading, srcToken, dstToken, step, stepIndex, totalSteps } =
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

## Cancel Order

Use the `useCancelOrder` hook for per-order cancellation with built-in status tracking:

```tsx
import { useCancelOrder, OrderStatus } from "@orbs-network/spot-react";

function CancelButton({ order }) {
  const { cancelOrder, isLoading } = useCancelOrder(order);

  if (order.status !== OrderStatus.Open) return null;

  return (
    <button onClick={cancelOrder} disabled={isLoading}>
      {isLoading ? "Cancelling..." : "Cancel"}
    </button>
  );
}
```

`useCancelOrder(order)` returns:
- `cancelOrder` — async function to trigger cancellation
- `isLoading`, `isSuccess`, `isError` — status flags
- `txHash` — transaction hash on success
- `error` — error message on failure

Each order's cancel status is tracked independently, so multiple cancellations can run concurrently.

## Order History

Build order history using `useSpot().orderHistoryPanel` for the list and `useDerivedHistoryOrder()` for individual order display:

```tsx
import { useDerivedHistoryOrder, OrderStatus } from "@orbs-network/spot-react";

function OrderHistorySection() {
  const { orders, isLoading, isRefetching, refetchOrders } = useSpot().orderHistoryPanel;

  if (isLoading) return <p>Loading orders...</p>;

  return (
    <div>
      <h3>Orders ({orders.all.length})</h3>
      {/* orders.all, orders.open, orders.completed, orders.cancelled, orders.expired */}
      {orders.all.map((order) => (
        <OrderPreview key={order.id} order={order} />
      ))}
    </div>
  );
}

function OrderPreview({ order }) {
  // useDerivedHistoryOrder(order, srcToken?, dstToken?) — pass tokens for amount formatting
  const derived = useDerivedHistoryOrder(order);
  if (!derived) return null;

  return (
    <div>
      <p>#{order.id} — {order.status}</p>
      <p>{derived.srcAmountUI} → {derived.dstAmountUI}</p>
      <CancelButton order={order} />
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
const formattedAmount = useAmountUi(decimals, amountWei);
```

## Advanced Hooks

Normal integrations should use `useSpot().orderExecutionPanel` for submission. Only reach for these exported low-level hooks if the DEX intentionally replaces the built-in submit flow:

```tsx
import { useSignOrder, useSubmitOrder, useSwapExecution } from "@orbs-network/spot-react";

// Sign an order (low-level, usually handled by orderExecutionPanel)
const signOrder = useSignOrder();

// Submit an order mutation (low-level, usually handled by orderExecutionPanel)
const submitOrder = useSubmitOrder();

// Track swap execution state (status, step, txHashes, etc.)
const swapExecution = useSwapExecution();
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
  getMinChunkSizeUsd, // (minChunkSizeUsd) => applies query override if present
  getOrderExecutionRate,   // (srcFilled, dstFilled, srcDecimals, dstDecimals) => rate
  getOrderLimitPriceRate,  // (order, srcDecimals, dstDecimals) => rate
  getTriggerPriceRate,     // (order, srcDecimals, dstDecimals) => rate
  getOrderFillDelayMillis, // (order, twapConfig) => milliseconds
} from "@orbs-network/spot-react";
```

## Constants

```tsx
import {
  DISCLAIMER_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_SLTP_FAQ_URL,
  ORBS_LOGO,
  ORBS_WEBSITE_URL,
  SPOT_VERSION,
  networks,
} from "@orbs-network/spot-react";
```

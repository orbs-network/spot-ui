# Hook-Driven Panels

All panel data is accessed via the `useSpot()` hook. Each property returns a panel object with data and callbacks.

The snippets below are intentionally framework-neutral. Replace placeholder components such as `CurrencyInputPanel`, `Select`, `Button`, `Dialog`, `ConnectWalletButton`, `SwitchNetworkButton`, and `DisclaimerAccept` with existing DEX components, and source variables such as `address`, `chainId`, `inputValue`, and `setInputAmount` from the DEX state/hooks.

## Display Amounts

Spot panel raw amount fields are raw integer strings. Convert them to the DEX's native amount type before display whenever the DEX has one, then display with the DEX formatter or `.toSignificant()` / `.toExact()`.

```tsx
function useDexAmountFromRawAmount(currency?: Currency, rawAmount?: string) {
  return useMemo(() => {
    if (!currency || rawAmount === undefined || rawAmount === "") return undefined;
    try {
      // Replace CurrencyAmount with the host DEX's amount type/helper.
      // Some DEXes need currency.wrapped, TokenAmount, or a JSBI/BigInt raw value.
      return CurrencyAmount.fromRawAmount(currency, rawAmount);
    } catch {
      return undefined;
    }
  }, [currency, rawAmount]);
}

const amountPerTrade = useDexAmountFromRawAmount(inputCurrency, spot.tradesAmountPanel.amountPerTrade);
return amountPerTrade ? `${amountPerTrade.toSignificant()} ${inputCurrency.symbol}` : undefined;
```

Use raw fields such as `dstTokenPanel.valueWei`, `amountPerTrade`, `price`, `amountPerChunk`, `feesAmount`, and history fill amounts as the conversion source. Use `*UI` fields when preserving the user's typed string in an editable input or when the host DEX has no amount object type.

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

For a small proof of integration, form sections can live near the main form. For a production DEX integration, split sections into focused components and put shared DEX adapter state/actions behind a local context hook instead of threading many props through the tree.

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

If Spot reuses the DEX token selector, keep it on the connected/account chain and hide chain switching inside token search. The user should switch networks through the DEX's normal network control, not from the Spot token modal. If the DEX selector does not support this, add a small optional prop such as `hideNetworkFilter` and enable it only for Spot.

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
      <span>{invertedDstToken?.symbol}</span>
      <input value={percentage || "0"} onChange={(e) => onPercentageChange(e.target.value)} />
      {usd && <span>${usd}</span>}
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
          <span>{invertedDstToken?.symbol}</span>
          <input value={percentage || "0"} onChange={(e) => onPercentageChange(e.target.value)} />
          {usd && <span>${usd}</span>}
          <button onClick={onReset}>Reset</button>
        </>
      )}
    </div>
  );
}
```

Limit and trigger percentage fields should be editable, not passive labels. If Spot does not provide a percentage yet, render a stable `"0"` / `"0%"` placeholder instead of `undefined` so the input layout does not jump.

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
      {error && <p className="error">{t(error.type, formatErrorArgs(error.args))}</p>}
    </div>
  );
}
```

Prefer `amountPerTrade` plus a DEX amount conversion over `amountPerTradeUI` when the DEX has a `CurrencyAmount`/`TokenAmount` type. Display the token symbol near the per-trade value. Do not show max-trade helper text unless the DEX product explicitly wants it.

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
function formatErrorArgs(args?: Record<string, string>) {
  if (!args) return {};
  // Current spot-react duration/fill-delay args are already human-readable.
  // Keep this helper for DEX i18n shaping or older/custom integrations that expose numeric values.
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, humanizeErrorArg(value)]),
  );
}

function InputErrorPanel() {
  const error = useSpot().inputError;
  if (!error) return null;

  // error.type is a translation key. error.args is an optional parameter object.
  return <p className="error">{t(error.type, formatErrorArgs(error.args))}</p>;
}
```

### Error keys reference:
- `insufficientFunds`, `emptyLimitPrice`, `missingLimitPrice`, `emptyTriggerPrice`
- `maxChunksError` (`{ maxChunks }`), `minChunksError` (`{ minChunks }`)
- `minTradeSizeError` (`{ minTradeSize }`), `maxOrderSize` (`{ maxOrderSize }` when emitted)
- `minDurationError` / `maxDurationError` (`{ duration }`)
- `minFillDelayError` / `maxFillDelayError` (`{ fillDelay }`)
- `StopLossTriggerPriceError`, `TakeProfitTriggerPriceError`, `triggerLimitPriceError`

Do not render raw millisecond values from custom or older error args. If a value such as `300000` reaches the UI, display it as `5 minutes`.

```tsx
function formatDurationMs(ms: number): string {
  const minutes = ms / 60_000;
  if (Number.isInteger(minutes) && minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  if (Number.isInteger(hours) && hours < 24) return `${hours} hours`;
  const days = hours / 24;
  return Number.isInteger(days) ? `${days} days` : `${minutes} minutes`;
}

function humanizeErrorArg(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric >= 60_000 ? formatDurationMs(numeric) : value;
}
```

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

When the host DEX has a collapsible disclaimer pattern, follow it. Keep the disclaimer text in the DEX's card/surface style, with a "Learn more" link to `DISCLAIMER_URL` / `ORBS_TWAP_FAQ_URL` as appropriate.

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
  if (!chainId || !supportedChains.includes(chainId)) {
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

Build your submit order UI using `useSpot().orderExecutionPanel` for execution state and `useSpot().derivedFormData` for order review details. Use `@orbs-network/swap-ui` for the order creation/progress flow UI inside the modal. The host DEX can still provide the modal shell, backdrop, close button, and surrounding layout, but the execution state content should be driven by `SwapFlow`.

When `orderExecutionPanel.status` is not `undefined`, switch from review mode to execution mode:

- Hide review details.
- Hide the confirm/submit button.
- Hide secondary close/cancel buttons in the modal footer.
- Hide the modal title if the swap/progress component already renders the current step title.
- Keep the top-right close button only if the DEX normally allows closing progress modals.
- Render the built progress/swap-flow state from `orderExecutionPanel`.

This mirrors the reference submit panel: review details are shown only before submission; progress/success/failure content owns the modal after submission begins.

### swap-ui flow

Verify current public exports before implementation. `@orbs-network/swap-ui` exposes `SwapFlow` and `SwapStatus`; use them rather than building a custom progress modal from scratch. `spot-react` also exports a `SwapStatus` enum, so alias the two imports when mapping execution state into `SwapFlow`.

```tsx
import {
  SwapStatus as SpotSwapStatus,
  useExplorerLink,
  useSpot,
} from "@orbs-network/spot-react";
import { SwapFlow, SwapStatus as SwapUiStatus } from "@orbs-network/swap-ui";

function SpotOrderFlow() {
  const {
    status,
    parsedError,
    srcToken,
    dstToken,
    step,
    stepIndex,
    totalSteps,
    wrapTxHash,
    approveTxHash,
  } = useSpot().orderExecutionPanel;
  const form = useSpot().derivedFormData;
  const progressTxHash = approveTxHash || wrapTxHash;
  const explorerUrl = useExplorerLink(progressTxHash);

  const swapStatus =
    status === SpotSwapStatus.SUCCESS
      ? SwapUiStatus.SUCCESS
      : status === SpotSwapStatus.FAILED
        ? SwapUiStatus.FAILED
        : SwapUiStatus.LOADING;

  return (
    <SwapFlow
      className="spot-order-flow"
      inAmount={form.srcAmountUI}
      outAmount={form.dstAmountUI}
      inToken={{ symbol: srcToken?.symbol }}
      outToken={{ symbol: dstToken?.symbol }}
      swapStatus={swapStatus}
      currentStep={{ title: step ? t(`spot.step.${step}`) : t("spot.step.createOrder") }}
      currentStepIndex={stepIndex}
      totalSteps={totalSteps}
      components={{
        SrcTokenLogo: <DexTokenLogo token={srcToken} />,
        DstTokenLogo: <DexTokenLogo token={dstToken} />,
        Loader: <DexSpinner />,
        Main: <SwapFlow.Main inUsd={form.srcAmountUsd} outUsd={form.dstAmountUsd} />,
        Success: (
          <SwapFlow.Success
            title={t("spot.orderCreated")}
            footerLink={explorerUrl}
            footerText={explorerUrl ? t("viewOnExplorer") : undefined}
          />
        ),
        Failed: <SwapFlow.Failed error={parsedError?.message} />,
      }}
    />
  );
}
```

Style the `SwapFlow` wrapper with the DEX theme. Do not copy the reference screenshot colors literally unless the integrated DEX already uses that palette; map the accent, surfaces, borders, and backgrounds to the host DEX design.

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
            {status && <SpotOrderFlow />}
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

For production DEXes, order history and order fills can grow large. Use the virtualization library already installed in the host app (for example `react-window`, `react-virtual`, or `react-virtuoso`) for both:

- the top-level orders list
- the selected order's fills list

Store only the selected `orderId` in React state. In details/fills components, look up the current order from `useSpot().orderHistoryPanel.orders.all` by id. This keeps the details view live if the order updates while the modal is open. If the host app has no virtualization library and adding one is out of scope, keep the list simple but avoid storing a copied selected order object.

```tsx
function OrderHistoryModal() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | undefined>();
  const orders = useSpot().orderHistoryPanel.orders.all;
  const selectedOrder = orders.find((order) => order.id === selectedOrderId);

  return selectedOrder ? (
    <OrderDetails orderId={selectedOrder.id} />
  ) : (
    <FixedSizeList itemCount={orders.length} itemSize={118} itemData={{ orders, setSelectedOrderId }}>
      {OrderRow}
    </FixedSizeList>
  );
}
```

Order details should use DEX-native accordion/panel rows and fit content height rather than forcing the same tall modal as the list view. Include:

- execution summary
- order info
- order fills
- cancel button for `OrderStatus.Open`
- explorer link for recipient/address fields when available
- copy-to-clipboard feedback for order id / tx hash if the DEX has toasts

Do not render sink URLs in the user-facing modal unless the host product explicitly requests them.

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

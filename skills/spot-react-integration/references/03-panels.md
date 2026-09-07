# Hook-Driven Panels

Use `useOrderForm()` for the authoritative calculated form and the other focused named hooks in leaf components so they depend only on the contract they render. Use `useExecution()` for submission state and `useOrders()` for history. Keep the module in host state and derive supported chains with `getPartnerChains(partner)`.

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

const amountPerTrade = useDexAmountFromRawAmount(
  inputCurrency,
  tradesPanel.inputAmountPerTrade.raw,
);
return amountPerTrade ? `${amountPerTrade.toSignificant()} ${inputCurrency.symbol}` : undefined;
```

Calculated amounts consistently expose `{ raw, ui, usd }`; history amounts
expose `{ raw, ui }`. Use `.raw` as the DEX amount-conversion source and `.ui`
when preserving an editable string or when the host has no amount object type.

## Focused Hooks Reference

```tsx
import {
  useExecution,
  useLimitPrice,
  useOrderForm,
  useOrders,
  useOutputAmount,
  usePriceDisplay,
  useTrades,
} from "@orbs-network/spot-react";

const calculatedForm = useOrderForm();
const tradesPanel = useTrades();
const limitPricePanel = useLimitPrice();
const outputAmount = useOutputAmount();

const execution = useExecution();
const history = useOrders();
```

| Panel | Key Returns |
|-------|------------|
| `useOutputAmount()` | `amount: { raw, ui, usd }`, `isLoading` |
| `useTrades()` | `totalTrades`, `maxTrades`, `onChange`, `error`, `inputAmountPerTrade`, `minOutputAmountPerTrade`, `triggerOutputAmountPerTrade`, `inputToken`, `outputToken` |
| `useDuration()` | `duration`, `onInputChange`, `onUnitSelect`, `onChange`, `milliseconds`, `error` |
| `useFillDelay()` | `fillDelay`, `onInputChange`, `onUnitSelect`, `onChange`, `milliseconds`, `error` |
| `useLimitPrice()` | `price: { raw, ui, usd }`, `canonicalPriceRaw`, `percentage`, `isEnabled`, `toggle`, input/reset actions, tokens, loading/error state |
| `useTriggerPrice()` | `price: { raw, ui, usd }`, `canonicalPriceRaw`, `percentage`, `outputAmountPerTrade`, input/reset actions, tokens, loading/error state |
| `usePriceDisplay()` | `onInvert`, `isInverted`, actual/display tokens, `isMarketOrder` |
| `useDisclaimer()` | Disclaimer string key or `undefined` |
| `useInputErrors()` | `{ type, args }` or `undefined` |
| `useSubmitButton()` | `disabled` and `loading` |
| `execution` | `submitOrder`, `phase`, `status`, `returnToOrderForm`, `startNewOrder`, `error`, `isPreparingOrder`, `isExecuting`, `isSuccess`, `isFailed`, `isRejected`, `canDismiss`, `currentStep`, `currentStepIndex`, `totalSteps`, `executionSteps`, `inputToken`, `outputToken`, `wrapTxHash`, `approvalTxHash` |
| `history` | Provider-scoped state with `data: { all, open, completed, cancelled, expired }` |


Cancel orders use `useCancelOrder` (see Cancel Order below).

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

Use DEX components unchanged. Pass `amount.ui` as the output amount:

```tsx
function TokenInputsSection() {
  const { amount: outputAmount, isLoading } = useOutputAmount();
  return (
    <>
      <CurrencyInputPanel value={inputValue} currency={inputCurrency} />
      <SwitchButton />
      <CurrencyInputPanel
        value={outputAmount.ui}
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
function PriceConfigSection({ module }: { module: Module }) {
  const { onInvert, isInverted, displayInputToken, isMarketOrder } =
    usePriceDisplay();
  const showTrigger = module === Module.STOP_LOSS || module === Module.TAKE_PROFIT;

  return (
    <div>
      <PriceHeader
        isInverted={isInverted}
        inputToken={displayInputToken}
        isMarketPrice={isMarketOrder}
        onInvert={onInvert}
      />
      {showTrigger && <TriggerPriceRow />}
      <LimitPriceRow showToggle={module !== Module.LIMIT} />
    </div>
  );
}

function PriceHeader({ isInverted, inputToken, isMarketPrice, onInvert }) {
  return (
    <div>
      <span>
        {isInverted ? "Buy" : "Sell"} {inputToken?.symbol}{" "}
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
    price, onInputChange, percentage, onPercentageChange,
    onReset, displayOutputToken, isTypedValue,
  } = useTriggerPrice();

  return (
    <div>
      <label>Trigger Price</label>
      <input
        value={isTypedValue ? price.ui : formatDecimals(price.ui, 6)}
        onChange={(e) => onInputChange(e.target.value)}
      />
      <span>{displayOutputToken?.symbol}</span>
      <input value={percentage || "0"} onChange={(e) => onPercentageChange(e.target.value)} />
      {price.usd && <span>${price.usd}</span>}
      <button onClick={onReset}>Reset</button>
    </div>
  );
}
```

### Limit Price

```tsx
function LimitPriceRow({ showToggle }) {
  const {
    price, onInputChange, percentage, onPercentageChange,
    isEnabled, toggle, onReset, displayOutputToken,
    isLoading, isTypedValue,
  } = useLimitPrice();

  return (
    <div>
      {showToggle && (
        <Switch checked={isEnabled} onCheckedChange={toggle} />
      )}
      <label>Limit Price</label>
      {isEnabled && (
        <>
          <input
            value={isTypedValue ? price.ui : formatDecimals(price.ui, 6)}
            onChange={(e) => onInputChange(e.target.value)}
          />
          <span>{displayOutputToken?.symbol}</span>
          <input value={percentage || "0"} onChange={(e) => onPercentageChange(e.target.value)} />
          {price.usd && <span>${price.usd}</span>}
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
  const { duration, onInputChange, onUnitSelect } =
    useDuration();
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
  const { totalTrades, onChange, error, inputAmountPerTrade, inputToken } =
    useTrades();

  return (
    <div>
      <label>Over</label>
      <NumericInput value={totalTrades} onChange={(v) => onChange(Number(v))} />
      {totalTrades > 1 && inputToken && (
        <p>{inputAmountPerTrade.ui} {inputToken.symbol} per trade (${inputAmountPerTrade.usd})</p>
      )}
      {error && <p className="error">{t(error.type, formatErrorArgs(error.args))}</p>}
    </div>
  );
}
```

Prefer `inputAmountPerTrade.raw` plus a DEX amount conversion over
`inputAmountPerTrade.ui` when the DEX has a `CurrencyAmount`/`TokenAmount`
type. Display the token symbol near the per-trade value. Do not show max-trade
helper text unless the DEX product explicitly wants it.

The user's explicit `totalTrades` selection persists when the input amount changes. If a lower amount reduces `maxTrades` below that selection, the SDK intentionally keeps the value and returns `InputErrors.MAX_TRADES` instead of silently clamping or resetting it. Render the error and keep submission disabled until the user selects a valid count.

## Trade Interval (TWAP only)

```tsx
function TradeIntervalSection() {
  const { fillDelay, onInputChange, onUnitSelect } =
    useFillDelay();
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
  const error = useInputErrors();
  if (!error) return null;

  // error.type is a translation key. error.args is an optional parameter object.
  return <p className="error">{t(error.type, formatErrorArgs(error.args))}</p>;
}
```

### Error keys reference:
- `insufficientFunds`, `missingLimitPrice`, `emptyTriggerPrice`
- `maxTradesError` (`{ maxTrades }`), `minTradesError` (`{ minTrades }`)
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
  const disclaimer = useDisclaimer();
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
import { getPartnerChains, Partners } from "@orbs-network/spot-react";

function SubmitOrderSection({ partner }: { partner: Partners }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { disabled, loading } = useSubmitButton();
  const { status, isSuccess, isExecuting, returnToOrderForm, startNewOrder } =
    useExecution();
  const supportedChains = getPartnerChains(partner);

  const onClose = useCallback(() => {
    if (isExecuting) return;
    setIsModalOpen(false);
    if (isSuccess) {
      setInputAmount("");
      setTimeout(() => {
        startNewOrder();
      }, 500);
    } else if (Boolean(status)) {
      setTimeout(() => {
        returnToOrderForm();
      }, 500);
    }
  }, [isExecuting, isSuccess, returnToOrderForm, setInputAmount, startNewOrder, status]);

  if (!address) return <ConnectWalletButton />;
  if (!chainId || !supportedChains.includes(chainId)) {
    return <SwitchNetworkButton targetChainId={supportedChains[0]} />;
  }

  return (
    <>
      <Button
        onClick={() => setIsModalOpen(true)}
        disabled={disabled}
        isLoading={loading}
      >
        {loading ? t("fetchingQuote") : t("placeOrder")}
      </Button>
      <SubmitOrderModal isOpen={isModalOpen} onClose={onClose} />
    </>
  );
}
```

`useClient` reads provider-scoped client initialization state when `partner` and a connected supported chain are available. The React package requires no host query provider, and the underlying `spot-ui` factory has no global cache. While initialization is active, submit loading follows the client state; a missing or unsupported chain disables submission without showing an endless loader. After retries are exhausted, `SpotProvider` renders `clientErrorFallback` with `error`, `retry`, and `isRetrying`; provide a localized DEX-native component.

## Submit Modal

Build your submit order UI using `useExecution()` for execution state and `useOrderForm()` for order review details. Use `@orbs-network/swap-ui` for the order creation/progress flow UI inside the modal. The host DEX can still provide the modal shell, backdrop, close button, and surrounding layout, but the execution state content should be driven by `SwapFlow`.

When `useExecution().status` is not `undefined`, switch from review mode to execution mode:

- Hide review details.
- Hide the confirm/submit button.
- Hide secondary close/cancel buttons in the modal footer.
- Hide the modal title if the swap/progress component already renders the current step title.
- Keep the top-right close button only if the DEX normally allows closing progress modals.
- Render the built progress/swap-flow state from `useExecution()`.

This mirrors the reference submit panel: review details are shown only before submission; progress/success/failure content owns the modal after submission begins.

### swap-ui flow

Verify current public exports before implementation. `@orbs-network/swap-ui`
exposes `SwapFlow` and `SwapStatus`; use them rather than building a custom
progress modal from scratch. `spot-react` exposes its own deliberately named
`ExecutionStatus`; map the two enums explicitly because the packages are
versioned independently.

```tsx
import {
  ExecutionStatus,
  useExecution,
  useExplorerLink,
  useOrderForm,
} from "@orbs-network/spot-react";
import { SwapFlow, SwapStatus as SwapUiStatus } from "@orbs-network/swap-ui";

function SpotOrderFlow() {
  const {
    status,
    error,
    inputToken,
    outputToken,
    currentStep,
    currentStepIndex,
    totalSteps,
    wrapTxHash,
    approvalTxHash,
  } = useExecution();
  const form = useOrderForm();
  const progressTxHash = approvalTxHash || wrapTxHash;
  const explorerUrl = useExplorerLink(progressTxHash);

  const swapStatus =
    status === ExecutionStatus.SUCCESS
      ? SwapUiStatus.SUCCESS
      : status === ExecutionStatus.FAILED
        ? SwapUiStatus.FAILED
        : status === ExecutionStatus.LOADING
          ? SwapUiStatus.LOADING
          : undefined;

  return (
    <SwapFlow
      className="spot-order-flow"
      inAmount={form.inputAmount.ui}
      outAmount={form.outputAmount.ui}
      inToken={{ symbol: inputToken?.symbol }}
      outToken={{ symbol: outputToken?.symbol }}
      swapStatus={swapStatus}
      currentStep={{ title: currentStep ? t(`spot.step.${currentStep}`) : t("spot.step.createOrder") }}
      currentStepIndex={currentStepIndex}
      totalSteps={totalSteps}
      components={{
        SrcTokenLogo: <DexTokenLogo token={inputToken} />,
        DstTokenLogo: <DexTokenLogo token={outputToken} />,
        Loader: <DexSpinner />,
        Main: <SwapFlow.Main inUsd={form.inputAmount.usd} outUsd={form.outputAmount.usd} />,
        Success: (
          <SwapFlow.Success
            title={t("spot.orderCreated")}
            footerLink={explorerUrl}
            footerText={explorerUrl ? t("viewOnExplorer") : undefined}
          />
        ),
        Failed: <SwapFlow.Failed error={error?.message} />,
      }}
    />
  );
}
```

Style the `SwapFlow` wrapper with the DEX theme. Do not copy the reference screenshot colors literally unless the integrated DEX already uses that palette; map the accent, surfaces, borders, and backgrounds to the host DEX design.

### `useExecution()` provides:
- `submitOrder` — trigger the order creation flow
- `status` — `ExecutionStatus` (`LOADING`, `SUCCESS`, `FAILED`) or undefined
- `isExecuting`, `isSuccess`, `isFailed` — convenience boolean flags derived from `status`
- `currentStep` — current step: WRAP, APPROVE, CREATE
- `currentStepIndex` / `totalSteps` — progress tracking
- `executionSteps` — ordered steps required for this execution
- `error` — parsed `{ code, message }` failure for display
- `returnToOrderForm()` — dismisses a failed/rejected execution while preserving the form and completed wrap metadata for retry; returns `false` during an active execution
- `startNewOrder()` — resets Spot's form and retry state after a terminal execution; returns `false` during an active execution

Use `phase` when the DEX needs precise progress. It transitions through `idle`,
`preparing`, `wrapping`, `approving`, `signing`, `submitting`, and `success`,
with terminal `failed` and `rejected` branches. Map the coarser `status` to
`swap-ui` as shown above. Keep the modal open while `isExecuting` is true; the
SDK also rejects reset actions during those phases.
- `isPreparingOrder` — whether client initialization or allowance preparation is pending
- `inputToken`, `outputToken` — resolved tokens (after wrap if needed)
- `wrapTxHash`, `approvalTxHash` — transaction hashes for explorer links

### `useOrderForm()` provides:
- Amounts: `inputAmount`, `outputAmount`, and `minOutputAmountTotal`, each with `raw`, `ui`, and `usd`
- Prices: `marketPrice`, `limitPrice`, `triggerPrice`, and `tradePrice`
- Trade config: `trades.totalTrades` and structured per-trade amounts
- Timing: `schedule`; exact start and deadline timestamps are assigned by
  `prepareOrder` after wrapping and approval, immediately before signing, and
  are available on `PreparedOrder.values`.
- Fees: `fees.raw`, `fees.ui`, `fees.usd`, and `fees.percentage`
- Type: `values.orderType`, `values.isMarketOrder`, and `values.isTriggerPrice`
- Validation: `errors`, `isReady`, and `canSubmit`

Use `useClient()` only when review UI also needs configuration such as
`spenderAddress` or `rePermitData`.

```tsx
function SubmitOrderModal({ isOpen, onClose }) {
  const [accepted, setAccepted] = useState(false);
  const { submitOrder, status, isExecuting, isSuccess, isFailed, error, isPreparingOrder, inputToken, outputToken, currentStep, currentStepIndex, totalSteps } =
    useExecution();
  const form = useOrderForm();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        {error ? (
          <ErrorDisplay error={error} onClose={onClose} />
        ) : (
          <>
            {!status && (
              <>
                {/* Order review details */}
                <p>Amount: {form.inputAmount.ui} → {form.outputAmount.ui}</p>
                {form.limitPrice.display.ui && <p>Limit: {form.limitPrice.display.ui}</p>}
                {form.triggerPrice.display.ui && <p>Trigger: {form.triggerPrice.display.ui}</p>}
                <p>Trades: {form.trades.totalTrades}</p>
                <p>Duration: {form.schedule.durationMillis} ms</p>
                {form.fees.percentage && <p>Fees: {form.fees.percentage}%</p>}

                <DisclaimerAccept accepted={accepted} onAcceptedChange={setAccepted} />
                <Button
                  onClick={submitOrder}
                  disabled={!accepted || Boolean(isPreparingOrder)}
                  isLoading={isPreparingOrder}
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

Use `useCancelOrder` for per-order cancellation with built-in status tracking:

```tsx
import { useCancelOrder, OrderStatus } from "@orbs-network/spot-react";

function CancelButton({ order }) {
  const { cancelOrder, disabled, isLoading } = useCancelOrder(order);

  if (order.status !== OrderStatus.Open) return null;

  return (
    <button onClick={cancelOrder} disabled={disabled || isLoading}>
      {isLoading ? "Cancelling..." : "Cancel"}
    </button>
  );
}
```

`useCancelOrder(order)` returns:
- `cancelOrder` — async function to trigger cancellation
- `disabled` — `true` when a v2 order is waiting for RePermit configuration
- `isLoading`, `isSuccess`, `isError` — status flags
- `txHash` — transaction hash on success
- `error` — error message on failure

Each order's cancel status is tracked independently, so multiple cancellations can run concurrently.

## Order History

Build order history using `useOrders()` for the list and `useHistoryOrder()` for individual order display. The history query and polling are active only while a component using `useOrders()` is mounted:

History starts after the Spot client configuration succeeds because v2 requests use the returned exchange adapter. When `supportLegacyOrders` is enabled, legacy v1 orders are fetched with the first successful history snapshot and retained while v2 history continues polling.

`useHistoryOrder` returns each amount as `{ raw, ui }`; historical USD values
are intentionally omitted when the service response does not provide them.

```tsx
import {
  OrderStatus,
  useHistoryOrder,
  useOrders,
} from "@orbs-network/spot-react";

function OrderHistorySection() {
  const { data, isLoading, isRefetching, refetch } = useOrders();
  const orders = data?.all ?? [];

  if (isLoading) return <p>Loading orders...</p>;

  return (
    <div>
      <h3>Orders ({orders.length})</h3>
      {/* data also provides open, completed, cancelled, and expired arrays */}
      {orders.map((order) => (
        <OrderPreview key={order.historyKey} order={order} />
      ))}
    </div>
  );
}

function OrderPreview({ order }) {
  // useHistoryOrder(order, inputToken?, outputToken?) — pass tokens for amount formatting
  const derived = useHistoryOrder(order);
  if (!derived) return null;

  return (
    <div>
      <p>#{order.id} — {order.status}</p>
      <p>
        {derived.inputAmount.ui} → minimum {derived.minOutputAmount.ui}
      </p>
      <CancelButton order={order} />
    </div>
  );
}
```

For production DEXes, order history and order fills can grow large. Use the virtualization library already installed in the host app (for example `react-window`, `react-virtual`, or `react-virtuoso`) for both:

- the top-level orders list
- the selected order's fills list

Store only the selected `historyKey` in React state. In details/fills components, look up the current order from `useOrders().data?.all ?? []` by `historyKey`. This keeps the details view live if the order updates while the modal is open and avoids collisions between numeric v1 IDs from different TWAP contracts. If the host app has no virtualization library and adding one is out of scope, keep the list simple but avoid storing a copied selected order object.

```tsx
function OrderHistoryModal() {
  const [selectedOrderKey, setSelectedOrderKey] = useState<string | undefined>();
  const orders = useOrders().data?.all ?? [];
  const selectedOrder = orders.find(
    (order) => order.historyKey === selectedOrderKey,
  );

  return selectedOrder ? (
    <OrderDetails orderId={selectedOrder.id} />
  ) : (
    <FixedSizeList itemCount={orders.length} itemSize={118} itemData={{ orders, setSelectedOrderKey }}>
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
import {
  useAmountUi,
  useExplorerLink,
  useNetwork,
} from "@orbs-network/spot-react";

// Explorer URL for a transaction hash
const explorerUrl = useExplorerLink(txHash);

// Current network info (name, native token, wrapped token, explorer)
const network = useNetwork();

// Format wei amount to UI display
const formattedAmount = useAmountUi(decimals, amountWei);
```

## Client Access

`useClient()` exposes the shared initialized client for advanced read access,
including RePermit configuration. Submission must still go through
`useExecution()` so allowance, wrapping, approval, signing, error handling,
and frozen execution values stay on one supported path.

```tsx
import { useClient } from "@orbs-network/spot-react";

const { data: client, isLoading } = useClient();
const permitData = client?.rePermitData;
```

## Utility Functions

```tsx
import {
  getPartners,        // () => all registered partners
  getTwapConfig,      // (partner, chainId) => legacy v1 timing config
  getPartnerChains,   // (partner) => supported chain IDs
  getNetwork,         // (chainId) => network config
  isNativeAddress,    // (address) => boolean
  eqIgnoreCase,       // (a, b) => case-insensitive address comparison
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

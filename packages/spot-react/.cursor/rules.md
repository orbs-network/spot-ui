# @orbs-network/spot-react Integration Guide

## Overview
`@orbs-network/spot-react` is a React component library for building Spot trading interfaces (TWAP, Limit, Stop-Loss, Take-Profit orders) on EVM chains. It provides hooks and components that manage order state, validation, and submission.

## Installation

**Important:** If `@orbs-network/twap-ui` is installed, uninstall it first - it's deprecated and replaced by `spot-react`:
```bash
npm uninstall @orbs-network/twap-ui
# or
pnpm remove @orbs-network/twap-ui
```

Then install spot-react:
```bash
npm install @orbs-network/spot-react
# or
pnpm add @orbs-network/spot-react
```

## Required Peer Dependencies
- react ^18.0.0 || ^19.0.0
- react-dom ^18.0.0 || ^19.0.0

---

## Core Setup

### Price Protection Setting

**Important:** `priceProtection` is NOT the same as slippage - it's a separate Spot-specific setting.

- Default value: `3` (meaning 3%)
- The protocol uses an oracle price to protect users from unfavorable executions
- If the execution price is worse than the oracle price by more than the allowed percentage, the transaction will not execute

**DEX Integration:** When the Spot tab is selected:
1. **Hide** the regular DEX slippage settings
2. **Show** only the Price Protection setting (use the same UI component as slippage)
3. Pass the value to `priceProtection` prop

Use the exported `PRICE_PROTECTION_SETTINGS` constant for the description text:

```tsx
import { PRICE_PROTECTION_SETTINGS } from "@orbs-network/spot-react";

// PRICE_PROTECTION_SETTINGS = "The protocol uses an oracle price to help protect users 
// from unfavorable executions. If the execution price is worse than the oracle price 
// by more than the allowed percentage, the transaction will not be executed."

// Example: Price Protection setting component
function PriceProtectionSetting() {
  const [priceProtection, setPriceProtection] = useState(3); // Default 3%
  
  return (
    <div>
      <label>Price Protection</label>
      <input 
        type="number" 
        value={priceProtection} 
        onChange={(e) => setPriceProtection(Number(e.target.value))}
      />
      <span>%</span>
      <p className="text-sm text-muted">{PRICE_PROTECTION_SETTINGS}</p>
    </div>
  );
}
```

### SpotProvider Props

```tsx
import { SpotProvider, Module, Partners } from "@orbs-network/spot-react";

<SpotProvider
  // === REQUIRED PROPS ===
  
  partner={Partners.Quick}           // Partner identifier (Quick, Thena, Spooky, etc.)
  module={Module.TWAP}               // Order type: TWAP | LIMIT | STOP_LOSS | TAKE_PROFIT
  priceProtection={3}                // Price protection % (default: 3) - NOT slippage!
  minChunkSizeUsd={5}                // Minimum individual trade size in USD
  
  // Market reference price - CRITICAL
  // This must be the expected OUTPUT amount (in wei) for the current INPUT amount
  marketReferencePrice={{
    value: "1850000000",             // Output amount in wei (NOT a ratio)
    isLoading: false,
    noLiquidity: false,
  }}
  
  // Required UI components (you must implement these)
  components={{
    Button: YourButton,              // ButtonProps
    Tooltip: YourTooltip,            // TooltipProps
    TokenLogo: YourTokenLogo,        // TokenLogoProps
    Spinner: <YourSpinner />,        // ReactNode
  }}
  
  // === TOKEN DATA ===
  
  srcToken={{                        // Source (sell) token
    address: "0x...",
    symbol: "ETH",
    decimals: 18,
    logoUrl: "https://..."
  }}
  dstToken={{                        // Destination (buy) token
    address: "0x...",
    symbol: "USDC",
    decimals: 6,
    logoUrl: "https://..."
  }}
  srcBalance="1000000000000000000"   // Source balance in wei (string)
  dstBalance="1000000000"            // Destination balance in wei (string)
  srcUsd1Token="1850.50"             // USD price for 1 source token
  dstUsd1Token="1.00"                // USD price for 1 destination token
  
  // === WALLET ===
  
  chainId={1}                        // Current chain ID
  account="0x..."                    // Connected wallet address
  provider={walletClient?.transport} // EIP-1193 provider
  
  // === OPTIONAL ===
  
  callbacks={callbacks}              // Order lifecycle callbacks
  refetchBalances={() => {}}         // Called after order progress updates
  useToken={useTokenByAddress}       // Hook: (address?: string) => Token | undefined
  fees={0.25}                        // Fee percentage to display
  
  // Override components for custom views
  // components.SubmitOrderSuccessView
  // components.SubmitOrderErrorView
  // components.SubmitOrderMainView
  // components.USD
  // components.Link
  // components.SuccessIcon
  // components.ErrorIcon
>
  {children}
</SpotProvider>
```

### Token Type
```tsx
type Token = {
  address: string;
  symbol: string;
  decimals: number;
  logoUrl: string;
};
```

### Module Types (Tabs)

The Spot integration should have 4 tabs:

| Tab | Module | Description |
|-----|--------|-------------|
| **TWAP** | `Module.TWAP` | Time-weighted average price - splits order into multiple trades |
| **Limit** | `Module.LIMIT` | Limit order - executes at specified price or better |
| **Stop-Loss** | `Module.STOP_LOSS` | Triggers sell when price drops below threshold |
| **Take-Profit** | `Module.TAKE_PROFIT` | Triggers sell when price rises above threshold |

```tsx
enum Module {
  TWAP = "twap",
  LIMIT = "limit", 
  STOP_LOSS = "stop_loss",
  TAKE_PROFIT = "take_profit"
}

// Example tabs implementation
function SpotTabs({ selectedModule, onModuleChange }) {
  return (
    <Tabs value={selectedModule} onValueChange={onModuleChange}>
      <TabsList>
        <TabsTrigger value={Module.TWAP}>TWAP</TabsTrigger>
        <TabsTrigger value={Module.LIMIT}>Limit</TabsTrigger>
        <TabsTrigger value={Module.STOP_LOSS}>Stop-Loss</TabsTrigger>
        <TabsTrigger value={Module.TAKE_PROFIT}>Take-Profit</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

---

## Hooks Reference

### `useSrcTokenPanel()` / `useDstTokenPanel()`

Token input panel state and handlers.

```tsx
const {
  value,                // string - Current amount value
  valueWei,             // string - Amount in wei
  balance,              // string - Token balance (UI format)
  usd,                  // string - USD value of amount
  token,                // Token | undefined
  isLoading,            // boolean - True when calculating output
  isInsufficientBalance,// InputError | undefined - Balance error
  onChange,             // (value: string) => void - Update amount
  onMax,                // () => void - Set to max balance
} = useSrcTokenPanel();

// Note: Only srcTokenPanel.onChange works - dstTokenPanel is read-only
```

### `useTypedSrcAmount()`

Get/reset the typed source amount.

```tsx
const {
  amount,  // string - Current typed amount
  reset,   // () => void - Clear the amount
} = useTypedSrcAmount();
```

### `useTradesPanel()` (TWAP only)

Configure number of trades.

```tsx
const {
  totalTrades,        // number - Current number of trades
  maxTrades,          // number - Maximum allowed trades
  amountPerTrade,     // string - Formatted amount per trade
  amountPerTradeWei,  // string - Amount per trade in wei
  amountPerTradeUsd,  // string - USD value per trade
  fromToken,          // Token | undefined
  toToken,            // Token | undefined
  label,              // string - "Over"
  tooltip,            // string - Tooltip text
  error,              // InputError | undefined
  onChange,           // (trades: number) => void
} = useTradesPanel();
```

### `useDurationPanel()`

Configure order expiration (for LIMIT, STOP_LOSS, TAKE_PROFIT).

```tsx
import { DEFAULT_DURATION_OPTIONS, TimeUnit } from "@orbs-network/spot-react";

const {
  duration,           // { value: number, unit: TimeUnit }
  milliseconds,       // number - Duration in milliseconds
  label,              // string - "Expiry"
  tooltip,            // string - Tooltip text
  error,              // InputError | undefined
  onChange,           // (duration: TimeDuration) => void
  onInputChange,      // (value: string) => void - Change value only
  onUnitSelect,       // (unit: TimeUnit) => void - Change unit only
} = useDurationPanel();

// TimeUnit values:
// TimeUnit.Minutes = 60000 (60 * 1000)
// TimeUnit.Hours = 3600000 (60 * 60 * 1000)  
// TimeUnit.Days = 86400000 (24 * 60 * 60 * 1000)

// DEFAULT_DURATION_OPTIONS:
// [{ text: "Minutes", value: TimeUnit.Minutes }, ...]
```

### `useFillDelayPanel()` (TWAP only)

Configure delay between trades.

```tsx
const {
  fillDelay,          // { value: number, unit: TimeUnit }
  milliseconds,       // number - Delay in milliseconds
  label,              // string - "Every"
  tooltip,            // string - Tooltip text
  error,              // InputError | undefined
  onChange,           // (fillDelay: TimeDuration) => void
  onInputChange,      // (value: string) => void
  onUnitSelect,       // (unit: TimeUnit) => void
} = useFillDelayPanel();
```

### `useLimitPricePanel()`

Configure limit price.

```tsx
const {
  price,              // string - Current price value
  usd,                // string - USD value
  percentage,         // string - Percentage from market price
  isLimitPrice,       // boolean - Is limit price enabled
  isLoading,          // boolean - Loading market price
  isInverted,         // boolean - Price direction inverted
  fromToken,          // Token | undefined
  toToken,            // Token | undefined
  label,              // string - "Limit Price"
  tooltip,            // string
  error,              // InputError | undefined
  warning,            // { text: string, url: string } | undefined
  onChange,           // (price: string) => void
  onPercentageChange, // (percentage: string) => void
  onReset,            // () => void - Reset to default
  toggleLimitPrice,   // () => void - Toggle on/off
  onInvert,           // () => void - Invert price direction
} = useLimitPricePanel();

// Note: For Module.LIMIT, isLimitPrice is always true
// For TWAP, STOP_LOSS, TAKE_PROFIT it's optional (toggle)
```

### `useTriggerPricePanel()` (STOP_LOSS / TAKE_PROFIT only)

Configure trigger price for conditional orders.

```tsx
const {
  price,              // string - Current trigger price
  usd,                // string - USD value
  percentage,         // string - Percentage from market price
  isLoading,          // boolean
  isInverted,         // boolean
  isActive,           // boolean - Is trigger active
  hide,               // boolean - True if not STOP_LOSS/TAKE_PROFIT
  fromToken,          // Token | undefined
  toToken,            // Token | undefined
  label,              // string - "Trigger Price"
  tooltip,            // string
  error,              // InputError | undefined
  onChange,           // (price: string) => void
  onPercentageChange, // (percentage: string) => void
  onReset,            // () => void
  onInvert,           // () => void
} = useTriggerPricePanel();
```

### `useInvertTradePanel()`

Invert price display direction.

```tsx
const {
  isInverted,    // boolean - Is price inverted
  isMarketPrice, // boolean - Is using market price (no limit)
  fromToken,     // Token | undefined - Display "from" token
  toToken,       // Token | undefined - Display "to" token
  onInvert,      // () => void - Toggle inversion
} = useInvertTradePanel();
```

### `useInputErrors()`

Get current validation error (returns first error).

```tsx
const error = useInputErrors();
// Returns: InputError | undefined

type InputError = {
  type: InputErrors;    // Error type enum
  value: string | number;
  message: string;      // Translated error message
};

enum InputErrors {
  EMPTY_LIMIT_PRICE,
  MAX_CHUNKS,
  MIN_CHUNKS,
  MIN_TRADE_SIZE,
  MAX_FILL_DELAY,
  MIN_FILL_DELAY,
  MAX_ORDER_DURATION,
  MIN_ORDER_DURATION,
  MISSING_LIMIT_PRICE,
  STOP_LOSS_TRIGGER_PRICE_GREATER_THAN_MARKET_PRICE,
  TRIGGER_LIMIT_PRICE_GREATER_THAN_TRIGGER_PRICE,
  TAKE_PROFIT_TRIGGER_PRICE_LESS_THAN_MARKET_PRICE,
  EMPTY_TRIGGER_PRICE,
  INSUFFICIENT_BALANCE,
  MAX_ORDER_SIZE,
}
```

### `useSubmitOrderPanel()`

Full order submission flow control.

```tsx
const {
  // Actions
  onSubmit,        // () => Promise<void> - Submit order
  onOpenModal,     // () => void - Call when opening modal
  onCloseModal,    // () => void - Call when closing modal
  reset,           // () => void - Reset all state
  
  // Status
  status,          // SwapStatus - Current status
  isLoading,       // boolean - Submission in progress
  isSuccess,       // boolean - Order created
  isFailed,        // boolean - Order failed
  
  // Data
  parsedError,     // { message: string, code: number } | undefined
  orderId,         // string | undefined - Created order ID
  step,            // Steps - Current step (WRAP | APPROVE | CREATE)
  stepIndex,       // number | undefined
  totalSteps,      // number | undefined
  srcToken,        // Token | undefined
  dstToken,        // Token | undefined
  approveTxHash,   // string | undefined
  wrapTxHash,      // string | undefined
} = useSubmitOrderPanel();

// SwapStatus enum (from @orbs-network/swap-ui):
// LOADING, SUCCESS, FAILED
```

### `useSubmitOrderButton()`

Just the submit button state.

```tsx
const {
  disabled,  // boolean - Button disabled
  text,      // string - "Place Order" | "Enter Amount" | "Insufficient Balance" | "No Liquidity"
  loading,   // boolean - Loading state
} = useSubmitOrderButton();
```

### `useOrderHistoryPanel()`

Order history and management.

```tsx
const {
  // Orders data
  orders,              // { all, open, completed, expired, canceled } - Order arrays
  ordersToDisplay,     // Order[] - Filtered orders
  openOrdersCount,     // number
  isLoading,           // boolean
  isRefetching,        // boolean
  
  // Selected order
  selectedOrder,       // HistoryOrder | undefined - Selected order details
  onHideSelectedOrder, // () => void - Deselect order
  
  // Filtering
  statuses,            // SelectMenuItem[] - Available status filters
  selectedStatus,      // string - Current filter
  onSelectStatus,      // (status?: OrderStatus) => void
  
  // Cancel
  cancelOrdersMode,    // boolean
  ordersToCancel,      // Order[]
  isCancelOrdersLoading, // boolean
  onCancelOrder,       // (order: Order) => Promise<string>
  onCancelOrders,      // (orders: Order[]) => void
  onToggleCancelOrdersMode, // (enabled: boolean) => void
  onSelectOrder,       // (id: string) => void - Toggle order selection
  onSelectAllOrdersToCancel, // () => void
  
  refetch,             // () => Promise<Order[]>
} = useOrderHistoryPanel();
```

### `useDisclaimerPanel()`

Get module-specific disclaimer message.

```tsx
const disclaimer = useDisclaimerPanel();
// Returns: { text: string, url: string } | undefined

// Shows different messages based on module and isMarketOrder state
```

### `useTranslations()`

Get translation function.

```tsx
const t = useTranslations();

// Available keys:
t("placeOrder")           // "Place order"
t("enterAmount")          // "Enter an amount"
t("insufficientFunds")    // "Insufficient Balance"
t("noLiquidity")          // "No liquidity for this pair"
t("limitPrice")           // "Limit Price"
t("expiry")               // "Expiry"
t("tradesAmountTitle")    // "Over"
t("tradeIntervalTitle")   // "Every"
t("stopLossLabel")        // "Trigger Price"
// ... and more (see translations for full list)
```

### `useFormatNumber()`

Format numbers with locale.

```tsx
const formatted = useFormatNumber({ 
  value: "1234.5678", 
  decimalScale: 2 
});
// Returns: { value: "1,234.57" }
```

### `useOrderInfo()`

Get complete order details for display.

```tsx
const orderInfo = useOrderInfo();
// Returns formatted order details including:
// - srcUsd, dstUsd
// - deadline { label, tooltip, value }
// - limitPrice { label, value, usd }
// - triggerPricePerTrade { label, tooltip, value, usd }
// - minDestAmountPerTrade { label, tooltip, value, usd }
// - sizePerTrade { label, tooltip, value }
// - totalTrades { label, tooltip, value }
// - tradeInterval { label, tooltip, value }
// - fees { label, amount, usd, percentage }
```

### `usePartnerChains()`

Get supported chains for current partner.

```tsx
const chains = usePartnerChains();
// Returns: number[] - Array of supported chain IDs
```

### `useAddresses()`

Get contract addresses for current config.

```tsx
const addresses = useAddresses();
// Returns contract addresses for the current chain/partner
```

---

## Pre-built Components

### `Components.SubmitOrderPanel`

Displays the order submission flow with steps (Wrap → Approve → Sign).

```tsx
import { Components } from "@orbs-network/spot-react";

<Components.SubmitOrderPanel
  reviewDetails={
    // Your custom review UI - shown before submission starts
    <div>
      <YourOrderSummary />
      <Button onClick={onSubmit}>Create Order</Button>
    </div>
  }
/>
```

The panel automatically shows:
- Token logos and amounts (from/to)
- Order details (deadline, limit price, trades, etc.)
- Step progress during submission
- Success/Error states

### `Components.Orders`

Pre-built orders list with detail view.

```tsx
<Components.Orders />
```

---

## Callbacks

```tsx
const callbacks = {
  // === WRAP (ETH → WETH) ===
  onWrapRequest: () => void,
  onWrapSuccess: ({ txHash, explorerUrl, amount }) => void,
  
  // === APPROVAL ===
  onApproveRequest: () => void,
  onApproveSuccess: ({ txHash, explorerUrl, token, amount }) => void,
  
  // === ORDER SIGNING ===
  onSignOrderRequest: () => void,
  onSignOrderSuccess: (signature: string) => void,
  onSignOrderError: (error: Error) => void,
  
  // === ORDER CREATED ===
  onOrderCreated: (order: Order) => void,
  
  // === ORDER FILLED ===
  onOrderFilled: (order: Order) => void,
  onOrdersProgressUpdate: (orders: Order[]) => void,
  
  // === ERRORS ===
  onSubmitOrderFailed: ({ message, code }) => void,
  onSubmitOrderRejected: () => void,
  
  // === CANCEL ===
  onCancelOrderRequest: (orders: Order[]) => void,
  onCancelOrderSuccess: ({ orders, txHash, explorerUrl }) => void,
  onCancelOrderFailed: (error: Error) => void,
  
  // === UI ===
  onCopy: () => void,
};
```

---

## Required UI Components Implementation

### ButtonProps
```tsx
interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: CSSProperties;
  allowClickWhileLoading?: boolean;
}
```

### TooltipProps
```tsx
interface TooltipProps {
  children?: ReactNode;
  tooltipText?: string;
}
```

### TokenLogoProps
```tsx
interface TokenLogoProps {
  token?: Token;
  size?: number;
  className?: string;
}
```

---

## Module-Specific UI Logic

```tsx
// Different modules show different inputs:

if (module === Module.TWAP) {
  // Show: TradesPanel, FillDelayPanel
  // Optional: LimitPricePanel (with toggle)
}

if (module === Module.LIMIT) {
  // Show: DurationPanel, LimitPricePanel (always on, no toggle)
}

if (module === Module.STOP_LOSS || module === Module.TAKE_PROFIT) {
  // Show: DurationPanel, TriggerPricePanel, LimitPricePanel (with toggle)
}
```

---

## Market Reference Price

**CRITICAL**: The `marketReferencePrice.value` must be the expected OUTPUT amount in wei for the current input amount.

```tsx
// Get the output amount from your DEX's quote/trade function
const marketReferencePrice = useMemo(() => {
  return {
    value: dexQuote?.outAmount,  // Wei string - e.g., "1850000000"
    isLoading: isQuoteLoading,
    noLiquidity: !dexQuote && !isQuoteLoading,
  };
}, [dexQuote, isQuoteLoading]);
```

---

## Integration Principles

**Use existing DEX components** - Do NOT create new components if the DEX already has them. Only create new components if the DEX doesn't have an equivalent.

Examples:
- Button, Input, Select, Switch, Dialog, Tabs → Use DEX components
- Tooltip, Spinner, TokenLogo → Use DEX components
- NumericInput → Use DEX component if available
- Token selector/modal → Use existing DEX token selector

---

## Complete Integration Example

The integration is organized into these sections:

1. **SpotProvider Setup** - Wrap your UI with the provider
2. **Amount Sync Listener** - Sync spot amount to DEX to trigger quotes
3. **Token Panels** - Use ONLY values from spot hooks (not DEX state)
4. **Price Config** - Limit price and trigger price inputs
5. **Order Config** - Trades, duration, fill delay based on module
6. **Validation & Submit** - Error display and submission flow
7. **Order History Button** - Button at the bottom of the form

---

### 1. SpotProvider Setup

```tsx
import {
  SpotProvider,
  Module,
  Partners,
  Components,
  useTypedSrcAmount,
  useSrcTokenPanel,
  useDstTokenPanel,
  useTradesPanel,
  useDurationPanel,
  useFillDelayPanel,
  useLimitPricePanel,
  useTriggerPricePanel,
  useSubmitOrderPanel,
  useSubmitOrderButton,
  useInputErrors,
  useDisclaimerPanel,
  useOrderHistoryPanel,
  useInvertTradePanel,
  DEFAULT_DURATION_OPTIONS,
  PRICE_PROTECTION_SETTINGS,
} from "@orbs-network/spot-react";

function SpotTradingWidget({ module }: { module: Module }) {
  const { address, chainId } = useWallet();
  const [priceProtection] = useState(3); // Your price protection state
  
  // DEX token selection
  const srcToken = useSelectedToken("src");
  const dstToken = useSelectedToken("dst");
  
  // DEX data (your existing hooks)
  const srcBalance = useBalance(srcToken?.address);
  const dstBalance = useBalance(dstToken?.address);
  const srcUsd = useUSDPrice(srcToken?.address);
  const dstUsd = useUSDPrice(dstToken?.address);
  const marketPrice = useDexQuote(srcToken, dstToken); // Triggered by AmountSyncListener

  return (
    <SpotProvider
      partner={Partners.Quick}
      module={module}
      chainId={chainId}
      account={address}
      provider={walletProvider}
      srcToken={srcToken}
      dstToken={dstToken}
      srcBalance={srcBalance}
      dstBalance={dstBalance}
      srcUsd1Token={srcUsd}
      dstUsd1Token={dstUsd}
      marketReferencePrice={marketPrice}
      priceProtection={priceProtection}
      minChunkSizeUsd={5}
      components={{
        Button: MyButton,
        Tooltip: MyTooltip,
        TokenLogo: MyTokenLogo,
        Spinner: <MySpinner />,
      }}
      callbacks={{
        onOrderCreated: (order) => toast.success("Order created!"),
        onApproveSuccess: () => toast.success("Approved!"),
      }}
    >
      <SpotForm module={module} />
      <AmountSyncListener />
    </SpotProvider>
  );
}
```

---

### 2. Amount Sync Listener

**Important:** The DEX must listen to `useTypedSrcAmount` and update its own input amount state to trigger quote fetching.

```tsx
function AmountSyncListener() {
  const { amount } = useTypedSrcAmount();
  const { setInputAmount } = useDexStore(); // Your DEX state setter
  
  useEffect(() => {
    // Sync spot amount → DEX state → triggers DEX quote
    setInputAmount(amount || "");
  }, [amount, setInputAmount]);
  
  return null;
}
```

---

### 3. Main Form Layout

```tsx
function SpotForm({ module }: { module: Module }) {
  return (
    <div className="flex flex-col gap-4">
      <TokenInputs />
      <PriceConfig module={module} />
      <OrderConfig module={module} />
      <ValidationErrors />
      <SubmitOrderFlow />
      <Disclaimer />
      <OrderHistoryButton />
    </div>
  );
}
```

---

### 4. Token Panels

**Important:** Token panels use ONLY values from the spot-react hooks. Do NOT use DEX state for these values.

```tsx
function TokenInputs() {
  return (
    <div className="flex flex-col gap-2">
      <SrcTokenInput />
      <ToggleTokensButton /> {/* Your existing toggle */}
      <DstTokenInput />
    </div>
  );
}

// ALL values come from useSrcTokenPanel() - NOT from DEX state
function SrcTokenInput() {
  const { value, balance, usd, token, onChange, onMax } = useSrcTokenPanel();
  
  return (
    <div className="bg-card p-4 rounded-lg">
      <div className="flex justify-between">
        <span>From</span>
        <span>Balance: {balance} <button onClick={onMax}>MAX</button></span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}           // From hook
          onChange={(e) => onChange(e.target.value)}  // From hook
          placeholder="0.0"
        />
        <TokenSelector token={token} />
      </div>
      <span className="text-sm text-muted">${usd}</span>
    </div>
  );
}

// ALL values come from useDstTokenPanel() - NOT from DEX state
function DstTokenInput() {
  const { value, balance, usd, token, isLoading } = useDstTokenPanel();
  
  return (
    <div className="bg-card p-4 rounded-lg">
      <div className="flex justify-between">
        <span>To (estimated)</span>
        <span>Balance: {balance}</span>
      </div>
      <div className="flex items-center gap-2">
        {isLoading ? <Spinner /> : <span>{value || "0.0"}</span>}
        <TokenSelector token={token} />
      </div>
      <span className="text-sm text-muted">${usd}</span>
    </div>
  );
}

// === 5. PRICE CONFIGURATION ===

function PriceConfig({ module }: { module: Module }) {
  return (
    <div className="bg-card p-4 rounded-lg flex flex-col gap-4">
      <PriceHeader />
      {(module === Module.STOP_LOSS || module === Module.TAKE_PROFIT) && (
        <TriggerPriceInput />
      )}
      <LimitPriceInput module={module} />
    </div>
  );
}

function PriceHeader() {
  const { isInverted, isMarketPrice, fromToken, onInvert } = useInvertTradePanel();
  
  return (
    <div className="flex justify-between items-center">
      <span>
        {isInverted ? "Buy" : "Sell"} {fromToken?.symbol}{" "}
        {isMarketPrice ? "at best rate" : "at rate"}
      </span>
      {!isMarketPrice && (
        <button onClick={onInvert}>⇄</button>
      )}
    </div>
  );
}

function TriggerPriceInput() {
  const {
    price,
    usd,
    percentage,
    toToken,
    label,
    tooltip,
    hide,
    onChange,
    onPercentageChange,
    onReset,
  } = useTriggerPricePanel();
  
  if (hide) return null;
  
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between">
        <Label text={label} tooltip={tooltip} />
        <button onClick={onReset}>Reset</button>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <span>{toToken?.symbol}</span>
          <input value={price} onChange={(e) => onChange(e.target.value)} />
          <span>${usd}</span>
        </div>
        <input
          className="w-24"
          value={percentage}
          onChange={(e) => onPercentageChange(e.target.value)}
          placeholder="0%"
        />
      </div>
    </div>
  );
}

function LimitPriceInput({ module }: { module: Module }) {
  const {
    price,
    usd,
    percentage,
    toToken,
    label,
    tooltip,
    isLimitPrice,
    isLoading,
    onChange,
    onPercentageChange,
    onReset,
    toggleLimitPrice,
  } = useLimitPricePanel();
  
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Show toggle only for non-LIMIT modules */}
        {module !== Module.LIMIT && (
          <Switch checked={isLimitPrice} onCheckedChange={toggleLimitPrice} />
        )}
        <Label text={label} tooltip={tooltip} />
        {isLimitPrice && <button onClick={onReset}>Reset</button>}
      </div>
      
      {isLimitPrice && (
        <div className="flex gap-2">
          <div className="flex-1">
            <span>{toToken?.symbol}</span>
            {isLoading ? (
              <Spinner />
            ) : (
              <input value={price} onChange={(e) => onChange(e.target.value)} />
            )}
            <span>${usd}</span>
          </div>
          <input
            className="w-24"
            value={percentage}
            onChange={(e) => onPercentageChange(e.target.value)}
            placeholder="0%"
          />
        </div>
      )}
    </div>
  );
}

// === 6. ORDER CONFIGURATION ===

function OrderConfig({ module }: { module: Module }) {
  if (module === Module.TWAP) {
    return (
      <div className="flex gap-4">
        <TradesInput />
        <FillDelayInput />
      </div>
    );
  }
  
  // LIMIT, STOP_LOSS, TAKE_PROFIT
  return <DurationInput />;
}

function TradesInput() {
  const { totalTrades, label, tooltip, error, onChange } = useTradesPanel();
  
  return (
    <div className={`bg-card p-4 rounded-lg ${error ? "border-red-500" : ""}`}>
      <Label text={label} tooltip={tooltip} />
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={totalTrades || ""}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span>Trades</span>
      </div>
    </div>
  );
}

function FillDelayInput() {
  const { fillDelay, label, tooltip, onInputChange, onUnitSelect } = useFillDelayPanel();
  
  return (
    <div className="bg-card p-4 rounded-lg">
      <Label text={label} tooltip={tooltip} />
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={fillDelay.value || ""}
          onChange={(e) => onInputChange(e.target.value)}
        />
        <select
          value={fillDelay.unit}
          onChange={(e) => onUnitSelect(Number(e.target.value))}
        >
          {DEFAULT_DURATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.text}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function DurationInput() {
  const { duration, label, tooltip, onInputChange, onUnitSelect } = useDurationPanel();
  
  return (
    <div className="bg-card p-4 rounded-lg">
      <Label text={label} tooltip={tooltip} />
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={duration.value || ""}
          onChange={(e) => onInputChange(e.target.value)}
        />
        <select
          value={duration.unit}
          onChange={(e) => onUnitSelect(Number(e.target.value))}
        >
          {DEFAULT_DURATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.text}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// === 7. VALIDATION ===

function ValidationErrors() {
  const error = useInputErrors();
  
  if (!error) return null;
  
  return (
    <div className="bg-red-500/20 p-3 rounded-lg flex items-center gap-2">
      <AlertIcon />
      <span>{error.message}</span>
    </div>
  );
}

// === 8. SUBMIT ORDER ===

function SubmitOrderFlow() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    onSubmit,
    onOpenModal,
    onCloseModal,
    isLoading,
    parsedError,
  } = useSubmitOrderPanel();
  
  const handleOpen = () => {
    setIsOpen(true);
    onOpenModal();
  };
  
  const handleClose = () => {
    setIsOpen(false);
    onCloseModal();
  };
  
  return (
    <>
      <SubmitButton onClick={handleOpen} />
      
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent>
          {parsedError ? (
            <ErrorView error={parsedError} onClose={handleClose} />
          ) : (
            <Components.SubmitOrderPanel
              reviewDetails={
                <div className="flex flex-col gap-4">
                  <DisclaimerCheckbox />
                  <Button onClick={onSubmit} isLoading={isLoading}>
                    Create Order
                  </Button>
                </div>
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SubmitButton({ onClick }: { onClick: () => void }) {
  const { disabled, text, loading } = useSubmitOrderButton();
  
  return (
    <Button onClick={onClick} disabled={disabled} isLoading={loading}>
      {text}
    </Button>
  );
}

// === 9. DISCLAIMER ===

function Disclaimer() {
  const disclaimer = useDisclaimerPanel();
  
  if (!disclaimer) return null;
  
  return (
    <div className="bg-card p-3 rounded-lg flex items-start gap-2">
      <InfoIcon />
      <p>
        {disclaimer.text}{" "}
        <a href={disclaimer.url} target="_blank" rel="noopener">
          Learn more
        </a>
      </p>
    </div>
  );
}

// === 10. ORDER HISTORY BUTTON (at bottom of form) ===

function OrderHistoryButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { orders, selectedOrder, onHideSelectedOrder, onSelectStatus, statuses, selectedStatus } = useOrderHistoryPanel();
  
  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <HistoryIcon />
        Order History ({orders.open?.length || 0})
      </Button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            {selectedOrder && (
              <button onClick={onHideSelectedOrder}>← Back</button>
            )}
            <DialogTitle>
              {selectedOrder ? selectedOrder.title : `Orders (${orders.all?.length})`}
            </DialogTitle>
          </DialogHeader>
          
          {!selectedOrder && (
            <select 
              value={selectedStatus} 
              onChange={(e) => onSelectStatus(e.target.value || undefined)}
            >
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>{s.text}</option>
              ))}
            </select>
          )}
          
          <Components.Orders />
        </DialogContent>
      </Dialog>
    </>
  );
}

// === HELPER COMPONENTS ===

function Label({ text, tooltip }: { text: string; tooltip?: string }) {
  return (
    <div className="flex items-center gap-1">
      <span>{text}</span>
      {tooltip && <Tooltip text={tooltip}><InfoIcon /></Tooltip>}
    </div>
  );
}
```

---

## Real DEX Integration Patterns

Based on production integrations, here are the common patterns:

### Recommended File Structure

```
src/components/twap/
├── twap-form.tsx         # SpotProvider wrapper
├── components.tsx        # Custom UI components
├── hooks.ts              # Adapter hooks (marketRef, tokens, USD)
├── context.ts            # Module state context
└── styles.css            # Styles
```

### Wagmi Integration Pattern

All production integrations use wagmi. Here's the standard pattern:

```tsx
import { useAccount, useChainId, useWalletClient } from 'wagmi';
import { SpotProvider, Partners, Module } from '@orbs-network/spot-react';

function SpotIntegration() {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  
  return (
    <SpotProvider
      provider={walletClient?.transport}
      account={account}
      chainId={chainId}
      partner={Partners.Quick}  // Change to your partner
      // ... other props
    >
      <SpotUI />
    </SpotProvider>
  );
}
```

### Market Reference Price Pattern

Wrap your existing DEX quote to return the expected output amount in wei:

```tsx
const useMarketReferencePrice = (
  outputAmount: string | undefined,  // Output amount in wei from DEX quote
  isLoading: boolean,                // Is quote loading
  noRoute: boolean                   // No route found
) => {
  return useMemo(() => ({
    value: outputAmount ?? '',
    isLoading,
    noLiquidity: noRoute,
  }), [outputAmount, isLoading, noRoute]);
};

// Usage in SpotProvider:
const quote = useDexQuote(srcToken, dstToken, srcAmount);
const marketReferencePrice = useMarketReferencePrice(
  quote?.outputAmount,
  quote?.isLoading,
  quote?.noRoute
);
```

### USD Price Pattern

USD prices should be the price of 1 token (not for the input amount):

```tsx
// Use existing DEX price hooks
const srcUsdPrice = useUSDPrice(srcToken);  // e.g., "1850.50"
const dstUsdPrice = useUSDPrice(dstToken);  // e.g., "1.00"

<SpotProvider
  srcUsd1Token={srcUsdPrice?.toString()}
  dstUsd1Token={dstUsdPrice?.toString()}
  // ...
/>
```

### Balance Pattern

Balances must be in wei (smallest unit) as strings:

```tsx
const { data: srcBalance } = useBalance({
  address: account,
  token: srcToken.address,
});

<SpotProvider
  srcBalance={srcBalance?.value?.toString()}  // e.g., "1000000000000000000"
  // ...
/>
```

### Token Conversion Pattern

Convert your DEX token format to spot-react format:

```tsx
const toSpotToken = (
  dexToken: DexToken | undefined,  // Your DEX token type
  isNative: boolean                 // Is native token (ETH, MATIC, etc.)
): Token | undefined => {
  if (!dexToken) return undefined;
  
  return {
    address: isNative ? zeroAddress : dexToken.address,
    symbol: dexToken.symbol ?? '',
    decimals: dexToken.decimals,
    logoUrl: dexToken.logoUrl ?? '',
  };
};

// Usage in SpotProvider:
const srcToken = toSpotToken(selectedSrcToken, selectedSrcToken?.isNative);
const dstToken = toSpotToken(selectedDstToken, selectedDstToken?.isNative);
```

### Module Selection Pattern

DEXes typically add tabs for different order types:

```tsx
const SPOT_TABS = [
  { id: 'twap', label: 'TWAP', module: Module.TWAP },
  { id: 'limit', label: 'Limit', module: Module.LIMIT },
  { id: 'stop-loss', label: 'Stop-Loss', module: Module.STOP_LOSS },
  { id: 'take-profit', label: 'Take-Profit', module: Module.TAKE_PROFIT },
];

function SpotTabs({ selected, onSelect }) {
  return (
    <div className="flex gap-2">
      {SPOT_TABS.map(tab => (
        <button
          key={tab.id}
          className={selected === tab.module ? 'active' : ''}
          onClick={() => onSelect(tab.module)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

### Callbacks Pattern

```tsx
const useCallbacks = () => {
  const { showToast } = useToast();
  const { whitelistedTokens } = usePairs();

  return {
    onOrderFilled: useCallback((order) => {
      const srcToken = whitelistedTokens.find(t => 
        eqIgnoreCase(t.address, order.srcTokenAddress)
      );
      const dstToken = whitelistedTokens.find(t => 
        eqIgnoreCase(t.address, order.dstTokenAddress)
      );
      showToast(`Order filled ${srcToken?.name} -> ${dstToken?.name}`, false);
    }, [showToast, whitelistedTokens]),
    
    onCancelOrderFailed: useCallback((error) => {
      const msg = (error?.message || '').toLowerCase();
      const isUserRejected = msg.includes('user rejected');
      showToast(
        isUserRejected ? 'Transaction declined' : 'Order cancellation failed',
        true
      );
    }, [showToast]),
    
    onCancelOrderSuccess: useCallback(() => {
      showToast('Order cancelled successfully', false);
    }, [showToast]),
  };
};
```

### Price Protection Settings

```tsx
const PriceProtection = () => {
  const { priceProtection, updatePriceProtection } = useUserPriceProtection();
  const [priceProtectionInput, setPriceProtectionInput] = useState('');
  
  // Validate: warn if < 1% or > 10%
  const error = useMemo(() => {
    if (!priceProtectionInput) return;
    if (Number(priceProtectionInput) < 1) return 'Transaction may fail';
    if (Number(priceProtectionInput) > 10) return 'Transaction may be frontrun';
  }, [priceProtectionInput]);

  return (
    <div>
      <Label>Price Protection</Label>
      <div className="flex gap-2">
        {[1, 3, 5].map(value => (
          <button
            key={value}
            className={priceProtection === value ? 'active' : ''}
            onClick={() => updatePriceProtection(value)}
          >
            {value}%
          </button>
        ))}
        <input
          type="number"
          placeholder={priceProtection.toString()}
          value={priceProtectionInput}
          onChange={(e) => setPriceProtectionInput(e.target.value)}
          onBlur={() => {
            if (priceProtectionInput) updatePriceProtection(Number(priceProtectionInput));
          }}
        />
      </div>
      {error && <span className="text-warning">{error}</span>}
    </div>
  );
};
```

### Amount Sync Pattern (Critical!)

The DEX must listen to `useTypedSrcAmount` and update its own state to trigger quotes:

```tsx
function AmountSyncListener({ setDexInputAmount }) {
  const { amount } = useTypedSrcAmount();

  useEffect(() => {
    setDexInputAmount(amount || '');  // Update your DEX input state
  }, [amount, setDexInputAmount]);
  
  return null;
}

// Usage: Place inside SpotProvider
<SpotProvider {...props}>
  <AmountSyncListener setDexInputAmount={setDexInputAmount} />
  {children}
</SpotProvider>
```

### useToken Hook Pattern

Implement this to allow spot-react to look up tokens by address for order history:

```tsx
const useTokenByAddress = (address?: string): Token | undefined => {
  const allTokens = useAllDexTokens();  // Your DEX token list
  const chainId = useChainId();
  
  return useMemo(() => {
    if (!address) return undefined;
    
    // Handle native token
    if (address.toLowerCase() === zeroAddress.toLowerCase()) {
      return {
        address: zeroAddress,
        symbol: getNativeSymbol(chainId),  // ETH, MATIC, etc.
        decimals: 18,
        logoUrl: getNativeLogo(chainId),
      };
    }
    
    // Find in token list
    const dexToken = allTokens.find(t => 
      t.address.toLowerCase() === address.toLowerCase()
    );
    
    return dexToken ? toSpotToken(dexToken, false) : undefined;
  }, [address, allTokens, chainId]);
};

// Pass to SpotProvider
<SpotProvider
  useToken={useTokenByAddress}
  // ...
/>
```

### Complete SpotProvider Setup

```tsx
<SpotProvider
  // Wallet
  provider={walletClient?.transport}
  account={walletAddress}
  chainId={chainId}
  
  // Tokens (use toSpotToken helper)
  srcToken={srcToken}
  dstToken={dstToken}
  
  // Balances (wei strings)
  srcBalance={srcBalanceWei}
  dstBalance={dstBalanceWei}
  
  // USD prices (price for 1 token)
  srcUsd1Token={srcUsdPrice}
  dstUsd1Token={dstUsdPrice}
  
  // Market price (use useMarketReferencePrice helper)
  marketReferencePrice={marketReferencePrice}
  
  // Config
  partner={Partners.YourPartner}
  module={selectedModule}
  priceProtection={priceProtection}
  minChunkSizeUsd={5}
  fees={0.25}
  
  // Hooks
  useToken={useTokenByAddress}
  
  // Components
  components={{
    Button: YourButton,
    Tooltip: YourTooltip,
    TokenLogo: YourTokenLogo,
    Spinner: <YourSpinner />,
  }}
>
  <AmountSyncListener setDexInputAmount={setDexInputAmount} />
  {children}
</SpotProvider>
```

### Common Integration Mistakes

1. **Wrong marketReferencePrice** - Must be output amount in wei, not a price ratio
2. **Missing amount sync** - DEX must listen to `useTypedSrcAmount` changes
3. **Wrong balance format** - Must be wei string, not formatted number
4. **USD price confusion** - Must be price for 1 token, not total value
5. **Missing native token handling** - Use `zeroAddress` for native tokens
6. **Forgetting priceProtection** - Must be separate from regular slippage
7. **Not implementing useToken** - Required for order history token display

---

## Integration Checklist

1. [ ] Uninstall `@orbs-network/twap-ui` if present
2. [ ] Install `@orbs-network/spot-react`
3. [ ] Implement required components: Button, Tooltip, TokenLogo, Spinner
4. [ ] Set up wallet connection (wagmi recommended)
5. [ ] Implement token data fetching (address, symbol, decimals, logoUrl)
6. [ ] Implement balance fetching (wei strings)
7. [ ] Implement USD price fetching (price for 1 token)
8. [ ] Implement market reference price (output amount for input)
9. [ ] **Add Price Protection setting** (default: 3%) - hide regular slippage when Spot tab is active
10. [ ] Wrap UI with SpotProvider
11. [ ] Build token panels with `useSrcTokenPanel`/`useDstTokenPanel`
12. [ ] **Add amount sync listener** with `useTypedSrcAmount`
13. [ ] Build order config based on module type
14. [ ] Build price panels with `useLimitPricePanel`/`useTriggerPricePanel`
15. [ ] Add validation with `useInputErrors`
16. [ ] Build submission with `useSubmitOrderPanel` + `Components.SubmitOrderPanel`
17. [ ] Add order history with `useOrderHistoryPanel` + `Components.Orders`
18. [ ] Implement callbacks for toast notifications
19. [ ] Implement `useToken` hook for token lookups

---

## Reference Implementations

For working examples, contact the Orbs team or check the `apps/web` folder in this repository.
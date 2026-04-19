# @orbs-network/spot-react

React SDK for building TWAP, Limit, Stop-Loss, and Take-Profit order interfaces on top of the [Orbs Spot protocol](https://www.orbs.com/).

## Installation

```bash
npm install @orbs-network/spot-react
```

### Peer Dependencies

These must be installed in your application:

```bash
npm install @tanstack/react-query bignumber.js react-error-boundary viem zustand react react-dom
```

| Package                | Version    |
| ---------------------- | ---------- |
| `@tanstack/react-query`| `^5.90.12` |
| `bignumber.js`         | `^9.3.1`   |
| `react-error-boundary` | `^6.0.0`   |
| `viem`                 | `^2.43.3`  |
| `zustand`              | `^5.0.9`   |
| `react`                | `^18 \|\| ^19` |
| `react-dom`            | `^18 \|\| ^19` |

## Quick Start

```tsx
import {
  SpotProvider,
  useSpot,
  Module,
  Partners,
} from "@orbs-network/spot-react";

function App() {
  return (
    <SpotProvider
      chainId={137}                          // Polygon
      provider={walletProvider}              // EIP-1193 provider
      account={walletAddress}               // Connected wallet address
      partner={Partners.Quick}              // DEX partner
      module={Module.TWAP}                  // Order type
      typedInputAmount={inputAmount}        // User-typed amount (string)
      priceProtection={0.5}                 // Slippage tolerance %
      minChunkSizeUsd={5}                   // Min chunk size in USD
      srcToken={srcToken}                   // { address, symbol, decimals, logoUrl }
      dstToken={dstToken}
      srcBalance={srcBalanceWei}            // Balance in wei (string)
      dstBalance={dstBalanceWei}
      srcUsd1Token={srcUsdPrice}            // USD price of 1 token (string)
      dstUsd1Token={dstUsdPrice}
      marketReferencePrice={marketPrice}    // { value?: string, isLoading?: boolean }
      callbacks={callbacks}                 // Lifecycle event handlers
      fees={0.25}                           // Fee percentage
    >
      <SwapForm />
    </SpotProvider>
  );
}
```

## SpotProvider Props

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `partner` | `Partners` | Yes | DEX partner enum |
| `module` | `Module` | Yes | `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT` |
| `typedInputAmount` | `string` | Yes | User-typed source amount |
| `priceProtection` | `number` | Yes | Slippage tolerance percentage |
| `minChunkSizeUsd` | `number` | Yes | Minimum trade chunk size in USD |
| `marketReferencePrice` | `MarketReferencePrice` | Yes | `{ value?: string, isLoading?: boolean, noLiquidity?: boolean }` |
| `chainId` | `number` | No | Connected chain ID |
| `provider` | `Provider` | No | EIP-1193 wallet provider |
| `account` | `string` | No | Connected wallet address |
| `srcToken` | `Token` | No | Source token |
| `dstToken` | `Token` | No | Destination token |
| `srcBalance` | `string` | No | Source balance in wei |
| `dstBalance` | `string` | No | Destination balance in wei |
| `srcUsd1Token` | `string` | No | USD price of 1 source token |
| `dstUsd1Token` | `string` | No | USD price of 1 destination token |
| `callbacks` | `Callbacks` | No | Lifecycle event handlers |
| `fees` | `number` | No | Fee percentage |
| `isDev` | `boolean` | No | Enable dev mode |
| `overrides` | `Overrides` | No | Custom wrap/approve/order handlers |

## useSpot() Hook

The main hook returns all data and controls for building the UI:

```tsx
const spot = useSpot();
```

### Returned panels

| Panel | Description |
| --- | --- |
| `spot.dstTokenPanel` | `{ value, isLoading }` — estimated output amount |
| `spot.tradesAmountPanel` | Total trades input, per-trade amounts, validation |
| `spot.durationPanel` | Order expiry duration input |
| `spot.fillDelayPanel` | Trade interval input |
| `spot.limitPricePanel` | Limit price input with percentage, toggle, reset |
| `spot.triggerPricePanel` | Trigger price for stop-loss / take-profit |
| `spot.pricePanel` | Market price display, inversion toggle |
| `spot.disclaimerPanel` | Disclaimer key string (or `undefined`) |
| `spot.inputError` | Validation error `{ type, args }` (or `undefined`) |
| `spot.submitOrderButton` | `{ disabled, loading }` |
| `spot.orderExecutionPanel` | Full submission lifecycle (see below) |
| `spot.orderHistoryPanel` | `{ orders: { all: Order[] } }` |
| `spot.derivedFormData` | Computed values: amounts, prices, deadline, fees |
| `spot.supportedChains` | Partner's supported chain IDs |
| `spot.module` | Current `Module` enum |
| `spot.mutations` | `{ cancelOrder, signOrder, submitOrder }` |

### Order Execution Panel

```tsx
const {
  onSubmit,              // Trigger order creation
  status,                // SwapStatus: LOADING | SUCCESS | FAILED
  step,                  // Current step: WRAP | APPROVE | CREATE
  stepIndex,             // Current step index (0-based)
  totalSteps,            // Total number of steps
  parsedError,           // { code, message } on failure
  onSwapSuccess,         // Call when user acknowledges success
  confirmButtonLoading,  // Loading state for confirm button
  srcToken,              // Resolved source token
  dstToken,              // Resolved destination token
  wrapTxHash,            // Wrap transaction hash
  approveTxHash,         // Approve transaction hash
} = useSpot().orderExecutionPanel;
```

## Callbacks

Pass lifecycle callbacks to `SpotProvider` for wallet notifications:

```tsx
const callbacks: Callbacks = {
  // Token wrapping
  onWrapRequest: () => {},
  onWrapSuccess: ({ txHash, explorerUrl, amount }) => {},

  // Token approval
  onApproveRequest: () => {},
  onApproveSuccess: ({ txHash, explorerUrl, token, amount }) => {},

  // Order lifecycle
  onSignOrderRequest: () => {},
  onSignOrderSuccess: (signature) => {},
  onSignOrderError: (error) => {},
  onOrderCreated: (order) => {},
  onOrderFilled: (order) => {},

  // Errors
  onSubmitOrderFailed: ({ code, message }) => {},
  onSubmitOrderRejected: () => {},

  // Order management
  onCancelOrderRequest: (orders) => {},
  onCancelOrderSuccess: ({ orders, txHash, explorerUrl }) => {},
  onCancelOrderFailed: (error) => {},

  // Progress (good place to refetch balances)
  onOrdersProgressUpdate: (orders) => {},

  // Clipboard
  onCopy: () => {},

  // State change callbacks
  onLimitPriceChange: (price) => {},
  onTriggerPriceChange: (price) => {},
  onDurationChange: (duration) => {},
  onFillDelayChange: (fillDelay) => {},
  onChunksChange: (chunks) => {},
};
```

## Translations / i18n

The SDK returns string keys for user-facing messages. You should resolve these through your own i18n system.

### Disclaimer keys

`useSpot().disclaimerPanel` returns one of:
- `"limitOrderDisclaimer"` — shown for limit and TWAP-limit orders
- `"marketOrderDisclaimer"` — shown for market orders
- `"triggerMarketPriceDisclaimer"` — shown for stop-loss at market price

### Input error keys

`useSpot().inputError` returns `{ type, args }` where `type` is a key like:
- `"enterAmount"`, `"insufficientFunds"`, `"emptyLimitPrice"`, `"emptyTriggerPrice"`
- `"maxChunksError"` (args: `{ maxChunks }`)
- `"minChunksError"` (args: `{ minChunks }`)
- `"minTradeSizeError"` (args: `{ minTradeSize }`)
- `"minDurationError"` / `"maxDurationError"` (args: `{ duration }`)
- `"minFillDelayError"` / `"maxFillDelayError"` (args: `{ fillDelay }`)
- `"noLiquidity"`

See `integration-example.tsx` for a full working reference.

## Order Types

| Module | Description |
| --- | --- |
| `Module.TWAP` | Time-Weighted Average Price — splits order into multiple trades over time |
| `Module.LIMIT` | Limit order — executes at specified price or better |
| `Module.STOP_LOSS` | Stop-loss — triggers when price drops to threshold |
| `Module.TAKE_PROFIT` | Take-profit — triggers when price rises to threshold |

### Panel visibility by module

| Panel | TWAP | LIMIT | STOP_LOSS | TAKE_PROFIT |
| --- | --- | --- | --- | --- |
| Trades amount | Yes | — | — | — |
| Fill delay | Yes | — | — | — |
| Duration | — | Yes | Yes | Yes |
| Limit price | Yes | Yes | Yes | Yes |
| Trigger price | — | — | Yes | Yes |

## Helper Hooks

```tsx
import {
  useExplorerLink,  // (txHash?: string) => explorer URL
  useNetwork,       // () => network info (name, native, wToken, explorer)
  useAmountUi,      // (amount: string, decimals: number) => formatted amount
} from "@orbs-network/spot-react";
```

## Utility Functions

```tsx
import {
  getPartners,           // () => all registered partners
  getPartnerChains,      // (partner) => supported chain IDs
  getNetwork,            // (chainId) => network config
  isNativeAddress,       // (address) => boolean
  eqIgnoreCase,          // (a, b) => case-insensitive address comparison
  getConfig,             // (partner, chainId) => SpotConfig
} from "@orbs-network/spot-react";
```

## Overrides

For custom wallet interactions, pass `overrides` to `SpotProvider`:

```tsx
<SpotProvider
  overrides={{
    wrap: async (amountWei) => txHash,
    approveOrder: async ({ tokenAddress, amount, spenderAddress }) => txHash,
    createOrder: async ({ contractAddress, abi, functionName, args }) => txHash,
    getAllowance: async ({ tokenAddress, spenderAddress }) => allowanceString,
    state: {
      isMarketOrder: false,
      chunks: 10,
      limitPrice: "1.5",
      triggerPrice: "1.2",
      fillDelay: { value: 5, unit: TimeUnit.Minutes },
      duration: { value: 1, unit: TimeUnit.Days },
    },
  }}
  // ...other props
/>
```

## Constants

```tsx
import {
  SPOT_VERSION,       // SDK version identifier
  DISCLAIMER_URL,     // Orbs disclaimer page
  ORBS_TWAP_FAQ_URL,  // TWAP FAQ page
  ORBS_SLTP_FAQ_URL,  // Stop-Loss/Take-Profit FAQ page
  ORBS_LOGO,          // Orbs logo URL
  ORBS_WEBSITE_URL,   // Orbs website
  networks,           // All supported network configs
} from "@orbs-network/spot-react";
```

## License

MIT

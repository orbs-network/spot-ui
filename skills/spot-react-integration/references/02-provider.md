# SpotProvider Setup

## Props

Wrap objects with `useMemo` and functions with `useCallback` so SpotProvider does not re-render unnecessarily.

```tsx
import { SpotProvider, Module, Partners } from "@orbs-network/spot-react";
import { useMemo, useCallback } from "react";

const marketReferencePrice = useMemo(() => ({
  value: trade?.outAmount,
  isLoading,
  noLiquidity: Boolean(typedValue) && !isLoading && !trade?.outAmount,
}), [trade?.outAmount, isLoading, typedValue]);

const srcToken = useMemo(() => ({
  address: inputCurrency?.address,
  symbol: inputCurrency?.symbol,
  decimals: inputCurrency?.decimals,
  logoUrl: inputCurrency?.logoUrl,
}), [inputCurrency]);

const dstToken = useMemo(() => ({
  address: outputCurrency?.address,
  symbol: outputCurrency?.symbol,
  decimals: outputCurrency?.decimals,
  logoUrl: outputCurrency?.logoUrl,
}), [outputCurrency]);

const callbacks = useMemo(() => ({
  // Order lifecycle
  onOrderCreated: (order) => toast.success("Order created"),
  onSubmitOrderFailed: ({ message }) => toast.error(message),
  onSubmitOrderRejected: () => toast.error("Order rejected"),
  onOrderFilled: (order) => toast.success("Order filled"),
  onOrdersProgressUpdate: (orders) => {
    refetchBalances(); // refetch balances when order progress changes
  },

  // Wrap & approve
  onWrapRequest: () => {},
  onWrapSuccess: ({ txHash, explorerUrl, amount }) => {
    toast.success("Wrapped");
    refetchBalances(); // refetch balances after wrap
  },
  onApproveRequest: () => {},
  onApproveSuccess: ({ txHash, explorerUrl, token, amount }) => toast.success("Approved"),

  // Signing
  onSignOrderRequest: () => {},
  onSignOrderSuccess: (signature) => {},
  onSignOrderError: (error) => toast.error(error.message),

  // Cancel
  onCancelOrderRequest: (order) => {},
  onCancelOrderSuccess: ({ order, txHash, explorerUrl }) => toast.success("Cancelled"),
  onCancelOrderFailed: (error) => toast.error(error.message),

  // Field change callbacks (useful for analytics or syncing external state)
  onLimitPriceChange: (typedLimitPrice) => {},
  onTriggerPriceChange: (typedTriggerPrice) => {},
  onDurationChange: (typedDuration) => {},
  onFillDelayChange: (typedFillDelay) => {},
  onChunksChange: (typedChunks) => {},
  onLimitPricePercentChange: (percent) => {},
  onTriggerPricePercentChange: (percent) => {},

  onCopy: () => toast.success("Copied"),
}), [refetchBalances]);

<SpotProvider
  partner={Partners.Quick}
  module={module}
  priceProtection={3}
  minChunkSizeUsd={5}
  typedInputAmount={inputAmount}
  marketReferencePrice={marketReferencePrice}
  srcToken={srcToken}
  dstToken={dstToken}
  srcBalance={inputBalance}
  dstBalance={outputBalance}
  srcUsd1Token={inputUsd}
  dstUsd1Token={outputUsd}
  chainId={chainId}
  account={address}
  walletInteractions={walletInteractions}
  fees={0.25}
  callbacks={callbacks}
/>
```

### Full Props Reference

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `partner` | `Partners` | Yes | DEX partner enum |
| `module` | `Module` | Yes | `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT` |
| `typedInputAmount` | `string` | Yes | User-typed source amount |
| `priceProtection` | `number` | Yes | Slippage tolerance percentage |
| `minChunkSizeUsd` | `number` | Yes | Minimum trade chunk size in USD |
| `marketReferencePrice` | `MarketReferencePrice` | Yes | `{ value?: string, isLoading?: boolean, noLiquidity?: boolean }` |
| `walletInteractions` | `WalletInteractions` | Yes | Wallet interaction handlers (see README) |
| `chainId` | `number` | No | Connected chain ID |
| `account` | `string` | No | Connected wallet address |
| `srcToken` | `Token` | No | `{ address, symbol, decimals, logoUrl }` |
| `dstToken` | `Token` | No | `{ address, symbol, decimals, logoUrl }` |
| `srcBalance` | `string` | No | Source balance in wei |
| `dstBalance` | `string` | No | Destination balance in wei |
| `srcUsd1Token` | `string` | No | USD price of 1 source token |
| `dstUsd1Token` | `string` | No | USD price of 1 destination token |
| `enableQueryParams` | `boolean` | No | Sync form state to URL query params |
| `callbacks` | `Callbacks` | No | Lifecycle event handlers |
| `fees` | `number` | No | Fee percentage (e.g. 0.25) |
| `isDev` | `boolean` | No | Enable dev mode |
| `overrides` | `Overrides` | No | Custom wrap/approve/order handlers and initial state |

## Input Amount Reset & Form Reset

spot-react does not reset the input amount or form state internally. Handle both in the submit modal's `onClose`:

```tsx
const { resetCurrentSwap, resetState, status } = useSpot().orderExecutionPanel;

const onClose = useCallback(() => {
  setIsModalOpen(false);
  if (Boolean(status)) {
    setInputAmount(""); // clear the input amount on success
    setTimeout(() => {
      resetCurrentSwap(); // resets the current swap execution
      resetState(); // resets the full form state
    }, 500); // delay so the close animation completes before state resets
  }
}, [resetCurrentSwap, resetState, setInputAmount, status]);
```

- `resetCurrentSwap()` — resets the current swap execution state
- `resetState()` — resets the full form state (store)
- `setInputAmount("")` — only clear the input when the order was successful

## Balance Refetch

Balance refetching is handled via callbacks, not a prop. Wire `refetchBalances` into:
- `onWrapSuccess` — after token wrap completes
- `onOrdersProgressUpdate` — when order fills update

## Price Protection

- Default 3%, this is NOT slippage
- When Spot is active: hide DEX slippage setting, show only Price Protection
- Persist the same way DEX stores slippage (zustand/redux/localStorage)

## Overrides

For initial form state, pass `overrides`:

```tsx
<SpotProvider
  overrides={{
    state: {
      isMarketOrder: false,
      chunks: 10,
      limitPrice: "1.5",
      triggerPrice: "1.2",
      fillDelay: { value: 5, unit: TimeUnit.Minutes },
      duration: { value: 1, unit: TimeUnit.Days },
    },
  }}
/>
```

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
  onOrderCreated: (order) => toast.success("Order created"),
  onSubmitOrderFailed: ({ message }) => toast.error(message),
  onWrapSuccess: ({ txHash }) => {
    toast.success("Wrapped");
    refetchBalances(); // refetch balances after wrap
  },
  onApproveSuccess: ({ txHash }) => toast.success("Approved"),
  onOrderFilled: (order) => toast.success("Order filled"),
  onCancelOrderSuccess: () => toast.success("Cancelled"),
  onOrdersProgressUpdate: () => {
    refetchBalances(); // refetch balances when order progress changes
  },
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
  provider={walletClient?.transport}
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
| `chainId` | `number` | No | Connected chain ID |
| `provider` | `Provider` | No | EIP-1193 wallet provider (transport) |
| `account` | `string` | No | Connected wallet address |
| `srcToken` | `Token` | No | `{ address, symbol, decimals, logoUrl }` |
| `dstToken` | `Token` | No | `{ address, symbol, decimals, logoUrl }` |
| `srcBalance` | `string` | No | Source balance in wei |
| `dstBalance` | `string` | No | Destination balance in wei |
| `srcUsd1Token` | `string` | No | USD price of 1 source token |
| `dstUsd1Token` | `string` | No | USD price of 1 destination token |
| `callbacks` | `Callbacks` | No | Lifecycle event handlers |
| `fees` | `number` | No | Fee percentage (e.g. 0.25) |
| `isDev` | `boolean` | No | Enable dev mode |
| `overrides` | `Overrides` | No | Custom wrap/approve/order handlers and initial state |

## Input Amount Reset & Form Reset

spot-react does not reset the input amount or form state internally. Handle both in the submit modal's `onClose`:

```tsx
const { onSwapSuccess, status } = useSpot().orderExecutionPanel;

const onClose = useCallback(() => {
  setIsModalOpen(false);
  if (Boolean(status)) {
    setInputAmount(""); // clear the input amount on success
    setTimeout(() => {
      onSwapSuccess(); // resets form state
    }, 500); // delay so the close animation completes before state resets
  }
}, [onSwapSuccess, setInputAmount, status]);
```

- `onSwapSuccess()` — resets the form state and creates a new empty swap execution
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

For custom wallet interactions or initial state, pass `overrides`:

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
/>
```

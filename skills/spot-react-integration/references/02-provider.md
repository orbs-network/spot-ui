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

## Input Amount Reset & Form Reset

spot-react does not reset the input amount or form state internally. Handle both in the submit modal's `onClose`:

```tsx
const { resetState, isSuccess } = useSubmitOrderPanel();

const onClose = useCallback(() => {
  setIsModalOpen(false);
  setTimeout(() => {
    resetState(); // creates a new swap execution, resets form state
    if (isSuccess) {
      setInputAmount(""); // clear the input amount on success
    }
  }, 500); // delay so the close animation completes before state resets
}, [resetState, setInputAmount, isSuccess]);
```

- `resetState()` — resets the form state and creates a new empty swap execution (bumps the index)
- `setInputAmount("")` — only clear the input when the order was successful

## Balance Refetch

Balance refetching is handled via callbacks, not a prop. Wire `refetchBalances` into:
- `onWrapSuccess` — after token wrap completes
- `onOrdersProgressUpdate` — when order fills update

## Price Protection

- Default 3%, this is NOT slippage
- When Spot is active: hide DEX slippage setting, show only Price Protection
- Persist the same way DEX stores slippage (zustand/redux/localStorage)

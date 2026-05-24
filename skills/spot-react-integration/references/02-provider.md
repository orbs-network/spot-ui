# SpotProvider Setup

## Props

Wrap objects with `useMemo` and functions with `useCallback` so SpotProvider does not re-render unnecessarily.

```tsx
import {
  SpotProvider,
  Module,
  Partners,
  type Token,
  type WalletInteractions,
} from "@orbs-network/spot-react";
import { useMemo } from "react";

const marketReferencePrice = useMemo(() => ({
  value: trade?.outAmount,
  isLoading,
  noLiquidity: Boolean(typedValue) && !isLoading && !trade?.outAmount,
}), [trade?.outAmount, isLoading, typedValue]);

const srcToken = useMemo((): Token | undefined => {
  if (!inputCurrency) return undefined;
  return {
    address: inputCurrency.address,
    symbol: inputCurrency.symbol,
    decimals: inputCurrency.decimals,
    logoUrl: inputCurrency.logoUrl,
  };
}, [inputCurrency]);

const dstToken = useMemo((): Token | undefined => {
  if (!outputCurrency) return undefined;
  return {
    address: outputCurrency.address,
    symbol: outputCurrency.symbol,
    decimals: outputCurrency.decimals,
    logoUrl: outputCurrency.logoUrl,
  };
}, [outputCurrency]);

const walletInteractions = useMemo<WalletInteractions>(() => ({
  wrapNativeToken: async (amountWei) => {
    const txHash = await dexWallet.wrapNativeToken(amountWei);
    await dexWallet.waitForReceipt(txHash);
    return txHash;
  },
  approveToken: async ({ tokenAddress, amount, spenderAddress }) => {
    const txHash = await dexWallet.approveToken({
      tokenAddress,
      amount,
      spenderAddress,
    });
    await dexWallet.waitForReceipt(txHash);
    return txHash;
  },
  cancelOrder: async ({ contractAddress, args, abi }) => {
    const txHash = await dexWallet.writeContract({
      address: contractAddress,
      abi,
      functionName: "cancel",
      args,
    });
    await dexWallet.waitForReceipt(txHash);
    return txHash;
  },
  signOrder: ({ domain, types, primaryType, message, account }) => {
    return dexWallet.signTypedData({
      domain,
      types,
      primaryType,
      message,
      account,
    });
  },
  getAllowance: async ({ tokenAddress, spenderAddress }) => {
    return dexWallet.getAllowance({ tokenAddress, spenderAddress });
  },
}), [dexWallet]);

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

The code above assumes a fictional `dexWallet` adapter. Replace it with the DEX's existing wallet/client helpers. The important part is the contract: write methods return a transaction hash only after the receipt is confirmed, and read/sign methods return the raw allowance string or signature string expected by the type.

### Full Props Reference

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `partner` | `Partners` | Yes | DEX partner enum |
| `module` | `Module` | Yes | `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT` |
| `typedInputAmount` | `string` | Yes | User-typed source amount |
| `priceProtection` | `number` | Yes | Price Protection percentage |
| `minChunkSizeUsd` | `number` | Yes | Minimum trade chunk size in USD |
| `marketReferencePrice` | `MarketReferencePrice` | Yes | `{ value?: string, isLoading?: boolean, noLiquidity?: boolean }` |
| `walletInteractions` | `WalletInteractions` | Yes | Wallet interaction handlers implemented by the DEX |
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

## WalletInteractions

`spot-react` is wallet-library agnostic. The DEX must pass a `walletInteractions` object that adapts the DEX's existing wallet stack (viem, ethers, web3.js, or another library) to these five methods:

| Method | What to do |
| --- | --- |
| `wrapNativeToken(amountWei)` | Deposit the native token into the chain's wrapped token contract. Wait for confirmation, throw if reverted, return the transaction hash. |
| `approveToken({ tokenAddress, amount, spenderAddress })` | Approve the token for `spenderAddress`. You may approve `amount` or a higher allowance according to DEX policy. Wait for confirmation, throw if reverted, return the transaction hash. |
| `cancelOrder({ order, contractAddress, args, abi })` | Call `cancel` on `contractAddress` using the supplied `abi` and `args`. Wait for confirmation, throw if reverted, return the transaction hash. |
| `signOrder({ domain, types, primaryType, message, account })` | Sign the supplied EIP-712 typed data and return the signature hex string. |
| `getAllowance({ tokenAddress, spenderAddress })` | Read ERC-20 allowance for the connected account and return the raw wei value as a string. |

The write methods should not return immediately after wallet submission. Wait for the transaction receipt so Spot can show correct progress and surface reverted transactions as failures.

## Quote, Balance, and Price Inputs

- `marketReferencePrice.value` should be the DEX quote output amount for the current `typedInputAmount`, not a standalone token price. The provider converts it into a per-unit market price internally.
- `srcBalance` and `dstBalance` are raw wei strings. Pass them from the DEX balance hooks so `submitOrderButton.disabled` and validation match the swap form.
- `srcUsd1Token` and `dstUsd1Token` are the USD value of one token. They are optional in the type, but real integrations should pass them because loading states, minimum trade size, and review details depend on them.
- `chainId` and `account` may be missing while disconnected. Keep the form rendered; only swap the submit area to the DEX's connect-wallet or switch-network control.

## Input Amount Reset & Form Reset

spot-react does not reset the DEX input amount internally. Handle the DEX input and Spot execution state in the submit modal's `onClose`:

```tsx
const { resetCurrentSwap, resetState, status, isSuccess } =
  useSpot().orderExecutionPanel;

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
```

- `resetCurrentSwap()` — resets the current swap execution state
- `resetState()` — resets the full form state (store)
- `setInputAmount("")` — only clear the DEX input when the order was successful
- Delay resets briefly so the close animation can finish before state changes

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

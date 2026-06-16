# SpotProvider Setup

## Own DEX Swap State Outside Spot

Keep the DEX swap form as the source of truth for selected tokens, typed input amount, balances, USD amounts, and quotes. Spot should adapt that state; it should not create a parallel swap form store.

Recommended pattern:

1. Read the DEX swap-form hook/context in one small adapter.
2. Expose only the Spot-relevant values through a DEX-owned context if multiple Spot components need them.
3. Have child components call that context/hook directly. Do not pass hook-returned values through intermediate components.
4. Pass all required values directly into `SpotProvider`; avoid a separate `useSpotProviderProps()` hook whose only job is forwarding props.

If child components need many of the same props, stop passing a long prop list and wrap those shared values/actions in a focused local context. The context should hold DEX adapter state, DEX callbacks, formatting helpers, and cross-component UI state; it should not mirror every `useSpot()` panel value, because children can call `useSpot()` directly.

The adapter should answer these questions explicitly:

| Value | Source | Shape passed to Spot |
| --- | --- | --- |
| Source/destination tokens | DEX token selection state | `Token` objects with `address`, `symbol`, `decimals`, `logoUrl` |
| Typed source amount | DEX input state | User-facing decimal string, e.g. `"1.25"` |
| Quote output | DEX quote/router state | Raw destination token amount for the current typed amount |
| Quote freshness | DEX quote request metadata | Whether the quote was produced for the current typed amount/token pair |
| Balances | DEX balance hooks | Raw integer strings |
| USD prices | DEX price hooks | USD value of one whole token as a string |
| Chain/account | Connected wallet/account hooks | Connected `chainId` and address |

```tsx
function SpotOrderForm({ module }: { module: Module }) {
  return (
    <SpotSwapFormStateProvider>
      <SpotOrderFormContent module={module} />
    </SpotSwapFormStateProvider>
  );
}

function SpotOrderFormContent({ module }: { module: Module }) {
  const {
    inputCurrency,
    outputCurrency,
    inputBalance,
    outputBalance,
    typedInputAmount,
    marketReferencePrice,
  } = useSpotSwapFormState();

  return (
    <SpotProvider
      module={module}
      typedInputAmount={typedInputAmount}
      marketReferencePrice={marketReferencePrice}
      srcBalance={inputBalance?.quotient.toString()}
      dstBalance={outputBalance?.quotient.toString()}
      srcToken={currencyToSpotToken(inputCurrency)}
      dstToken={currencyToSpotToken(outputCurrency)}
      // other props...
    />
  );
}
```

Keep the adapter small enough to read. When the Spot integration grows, split it by responsibility:

```txt
components/spot/
  spot-form.tsx
  token-inputs-section.tsx
  price-config-section.tsx
  submit-order-modal.tsx
  orders-modal.tsx
  order-details.tsx
  context.tsx
  hooks.ts
  utils.ts
```

Use the DEX's existing folder conventions if they differ; the point is to avoid one large file that mixes provider setup, wallet adapters, form sections, modals, history rows, formatting, and transaction helpers.

## Props

Wrap objects with `useMemo` and functions with `useCallback` so SpotProvider does not re-render unnecessarily.

If the DEX returns large objects whose identity changes every render, destructure the primitive fields you need before memoizing and use those primitive fields in dependency arrays. This is especially important for quote state, balances, tokens, callbacks, and wallet adapters.

```tsx
import {
  SpotProvider,
  Module,
  Partners,
  type Token,
  type WalletInteractions,
  type Callbacks,
  type MarketReferencePrice,
} from "@orbs-network/spot-react";
import { useMemo } from "react";

const {
  quotedInputAmount = "",
  quoteOutputRaw,
  isQuoteLoading,
} = dexSwapState;

const marketReferencePrice = useMemo<MarketReferencePrice>(() => {
  const shouldQuote = Boolean(
    typedInputAmount && inputCurrency && outputCurrency,
  );
  const isQuoteStale = shouldQuote && typedInputAmount !== quotedInputAmount;
  const outputAmount = !shouldQuote || isQuoteStale ? undefined : quoteOutputRaw;
  const isLoading = shouldQuote && (isQuoteStale || isQuoteLoading);

  return {
    value: outputAmount,
    isLoading,
    noLiquidity: shouldQuote && !isLoading && !outputAmount,
  };
}, [
  inputCurrency,
  isQuoteLoading,
  outputCurrency,
  quoteOutputRaw,
  quotedInputAmount,
  typedInputAmount,
]);

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

const callbacks = useMemo<Callbacks>(() => ({
  // Order lifecycle
  // Usually keep creation silent because the submit modal already shows success.
  onOrderCreated: () => refetchBalances(),
  onSubmitOrderFailed: ({ message }) => toast.error(message),
  onSubmitOrderRejected: () => toast.error("Order rejected"),
  onOrderFilled: () => {
    toast.success("Order filled");
    refetchBalances();
  },
  onOrdersProgressUpdate: (_orders) => {
    refetchBalances(); // refetch balances when order progress changes
  },

  // Wrap & approve
  onWrapRequest: () => {},
  onWrapSuccess: ({
    txHash: _txHash,
    explorerUrl: _explorerUrl,
    amount: _amount,
  }) => {
    toast.success("Wrapped");
    refetchBalances(); // refetch balances after wrap
  },
  onApproveRequest: () => {},
  onApproveSuccess: ({
    txHash: _txHash,
    explorerUrl: _explorerUrl,
    token: _token,
    amount: _amount,
  }) => toast.success("Approved"),

  // Signing
  onSignOrderRequest: () => {},
  onSignOrderSuccess: (_signature) => {},
  onSignOrderError: (error) => toast.error(error.message),

  // Cancel
  onCancelOrderRequest: (_order) => {},
  onCancelOrderSuccess: ({
    order: _order,
    txHash: _txHash,
    explorerUrl: _explorerUrl,
  }) => {
    toast.success("Cancelled");
    refetchBalances();
  },
  onCancelOrderFailed: (error) => toast.error(error.message),

  // Field change callbacks (useful for analytics or syncing external state)
  onLimitPriceChange: (_typedLimitPrice) => {},
  onTriggerPriceChange: (_typedTriggerPrice) => {},
  onDurationChange: (_typedDuration) => {},
  onFillDelayChange: (_typedFillDelay) => {},
  onChunksChange: (_typedChunks) => {},
  onLimitPricePercentChange: (_percent) => {},
  onTriggerPricePercentChange: (_percent) => {},

  onCopy: () => toast.success("Copied"),
}), [refetchBalances, toast]);

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

Pass a resolved `priceProtection` number. If the DEX setting has a default, resolve it before rendering `SpotProvider` (for example destructure with a default) instead of passing `priceProtection ?? DEFAULT_PRICE_PROTECTION` inline.

If the DEX quote stores the quoted input amount in raw units instead of the user-facing typed amount, compare against the DEX's current raw source amount instead. Quote freshness checks must compare the same representation.

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
| `overrides` | `Overrides` | No | Initial Spot form state such as default chunks, duration, fill delay, trigger price, limit price, and market/limit mode |

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
- Get `chainId` from the connected account/wallet hook wherever Spot needs chain identity. Avoid mixing router, quote, and account chain sources.
- `chainId` and `account` may be missing while disconnected. Keep the form rendered; only swap the submit area to the DEX's connect-wallet or switch-network control.
- When `chainId` is missing or unsupported, `SpotProvider` internally falls back to the partner's first supported chain for config lookups. The DEX UI must still block submission with connect/switch-network controls until the wallet is on a supported chain.
- If the DEX quote result exposes the input amount used for the quote, treat a mismatch with the current typed amount as a stale quote. While stale, set `marketReferencePrice.value` to `undefined` and `isLoading` to `true` so typing a new input amount triggers a fresh quote state instead of showing an old output.
- Compute `srcUsd1Token` and `dstUsd1Token` as the USD value of one token. Prefer the DEX's direct one-token USD hook. If unavailable, derive it as `usdAmount / tokenAmount` from the current swap form amounts. Pass strings; omit only when no valid positive value is available.

```tsx
function getUsdValuePerToken(tokenAmount?: CurrencyAmount<Currency>, usdAmount?: CurrencyAmount<Currency>) {
  const tokenValue = Number(tokenAmount?.toSignificant(18));
  const usdValue = Number(usdAmount?.toSignificant(18));

  if (!Number.isFinite(tokenValue) || !Number.isFinite(usdValue) || tokenValue <= 0 || usdValue <= 0) {
    return undefined;
  }

  return String(usdValue / tokenValue);
}
```

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
- `onOrderCreated` — after the order is accepted by the order sink
- `onOrderFilled` — after an observed order reaches completed status
- `onOrdersProgressUpdate` — when one or more observed orders change fill progress
- `onCancelOrderSuccess` — after cancellation transaction confirms

Avoid showing a toast for `onOrderCreated` unless the host DEX explicitly asks for one. The submit flow success state already tells the user the order was created. Fill and cancel toasts are still useful because they can happen outside the modal.

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

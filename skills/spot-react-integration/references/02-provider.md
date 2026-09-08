# SpotProvider Setup

## Own DEX Swap State Outside Spot

Keep the DEX swap form as the source of truth for selected tokens, typed input amount, balances, USD amounts, and quotes. Spot should adapt that state; it should not create a parallel swap form store.

Recommended pattern:

1. Read the DEX swap-form hook/context in one small adapter.
2. Expose only the Spot-relevant values through a DEX-owned context if multiple Spot components need them.
3. Have child components call that context/hook directly. Do not pass hook-returned values through intermediate components.
4. Pass all required values directly into `SpotProvider`; avoid a separate `useSpotProviderProps()` hook whose only job is forwarding props.

If child components need many of the same props, stop passing a long prop list and wrap those shared values/actions in a focused local context. The context should hold DEX adapter state, DEX callbacks, formatting helpers, and cross-component UI state; it should not mirror Spot panel values, because children can call the relevant focused Spot hook directly.

The adapter should answer these questions explicitly:

| Value | Source | Shape passed to Spot |
| --- | --- | --- |
| Input/output tokens | DEX token selection state | `Token` objects with `address`, `symbol`, `decimals`, and optional `logoUrl` |
| Wrapped native token | DEX chain configuration | The connected chain's wrapped-native `Token` |
| Typed input amount | DEX input state | User-facing decimal string, e.g. `"1.25"` |
| Quote output | DEX quote/router state | Raw output token amount for the current typed amount |
| Quote freshness | DEX quote request metadata | Whether the quote was produced for the current typed amount/token pair |
| Input balance | DEX balance hook | Raw integer string |
| USD prices | DEX price hooks | USD value of one whole token as a string |
| Chain/account | Connected wallet/account hooks | Connected `chainId` and address |

The provider store stays mounted when tokens or modules change. Spot reapplies
form defaults without refetching the same partner/chain client or discarding
history/cancellation resources. A scope change during execution is deferred
until the frozen attempt reaches a terminal phase.

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
    wrappedNativeCurrency,
    inputBalanceRaw,
    inputAmountUi,
    marketQuote,
  } = useSpotSwapFormState();

  return (
    <SpotProvider
      module={module}
      inputAmountUi={inputAmountUi}
      marketQuote={marketQuote}
      inputBalanceRaw={inputBalanceRaw}
      inputToken={currencyToSpotToken(inputCurrency)}
      outputToken={currencyToSpotToken(outputCurrency)}
      wrappedNativeToken={currencyToSpotToken(wrappedNativeCurrency)}
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
  type MarketQuote,
} from "@orbs-network/spot-react";
import { useMemo } from "react";

const {
  quotedInputAmount = "",
  quoteOutputRaw,
  isQuoteLoading,
} = dexSwapState;

const marketQuote = useMemo<MarketQuote>(() => {
  const shouldQuote = Boolean(
    inputAmountUi && inputCurrency && outputCurrency,
  );
  const isQuoteStale = shouldQuote && inputAmountUi !== quotedInputAmount;
  const outputAmount = !shouldQuote || isQuoteStale ? undefined : quoteOutputRaw;
  const isLoading = shouldQuote && (isQuoteStale || isQuoteLoading);

  return {
    quotedOutputAmountRaw: outputAmount,
    isLoading,
    noLiquidity: shouldQuote && !isLoading && !outputAmount,
  };
}, [
  inputCurrency,
  isQuoteLoading,
  outputCurrency,
  quoteOutputRaw,
  quotedInputAmount,
  inputAmountUi,
]);

const inputToken = useMemo((): Token | undefined => {
  if (!inputCurrency) return undefined;
  return {
    address: inputCurrency.address,
    symbol: inputCurrency.symbol,
    decimals: inputCurrency.decimals,
    logoUrl: inputCurrency.logoUrl,
  };
}, [inputCurrency]);

const outputToken = useMemo((): Token | undefined => {
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
  signOrder: ({ signerAddress, typedData }) => {
    return dexWallet.signTypedData({
      ...typedData,
      account: signerAddress,
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
    amount: _amount,
  }) => {
    toast.success("Wrapped");
    refetchBalances(); // refetch balances after wrap
  },
  onApproveRequest: () => {},
  onApproveSuccess: ({
    txHash: _txHash,
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
  }) => {
    toast.success("Cancelled");
    refetchBalances();
  },
  onCancelOrderFailed: (error) => toast.error(error.message),

  // Field change callbacks (useful for analytics or syncing external state)
  onLimitPriceChange: (_limitPriceUi) => {},
  onTriggerPriceChange: (_triggerPriceUi) => {},
  onOrderDurationChange: (_orderDuration) => {},
  onTradeIntervalChange: (_tradeInterval) => {},
  onTradeCountChange: (_tradeCount) => {},
  onLimitPricePercentChange: (_percent) => {},
  onTriggerPricePercentChange: (_percent) => {},

  onCopy: () => toast.success("Copied"),
}), [refetchBalances, toast]);

<SpotProvider
  partner={Partners.Quick}
  module={module}
  priceProtectionPercent={3}
  minTradeSizeUsd={5}
  inputAmountUi={inputAmountUi}
  marketQuote={marketQuote}
  inputToken={inputToken}
  outputToken={outputToken}
  wrappedNativeToken={wrappedNativeToken}
  inputBalanceRaw={inputBalanceRaw}
  inputTokenUsdPrice={inputTokenUsdPrice}
  outputTokenUsdPrice={outputTokenUsdPrice}
  chainId={chainId}
  account={address}
  appId="my-dex"
  walletInteractions={walletInteractions}
  displayFeePercent={0.25}
  callbacks={callbacks}
/>
```

The code above assumes a fictional `dexWallet` adapter. Replace it with the DEX's existing wallet/client helpers. The important part is the contract: write methods return a transaction hash only after the receipt is confirmed, allowance reads return a raw integer string, and `signOrder` returns the wallet's original `0x`-prefixed signature.

Pass a resolved `priceProtectionPercent` number. If the DEX setting has a default, resolve it before rendering `SpotProvider` instead of resolving it inline.

If the DEX quote stores the quoted input amount in raw units instead of the user-facing typed amount, compare against the DEX's current raw source amount instead. Quote freshness checks must compare the same representation.

### Full Props Reference

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `partner` | `Partners` | Yes | DEX partner enum |
| `module` | `Module` | Yes | `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT` |
| `inputAmountUi` | `string` | Yes | User-entered input-token amount |
| `priceProtectionPercent` | `number` | Yes | Price Protection percentage |
| `minTradeSizeUsd` | `number` | Yes | Minimum individual trade size in USD |
| `marketQuote` | `MarketQuote` | Yes | `{ quotedOutputAmountRaw?: string, isLoading?: boolean, noLiquidity?: boolean }` |
| `walletInteractions` | `WalletInteractions` | Yes | Wallet interaction handlers implemented by the DEX |
| `chainId` | `number` | No | Connected chain ID |
| `account` | `Address` | No | Connected wallet address |
| `appId` | `string` | No | Stable host-defined analytics identifier, such as the DEX slug |
| `inputToken` | `Token` | No | `{ address, symbol, decimals, logoUrl? }` |
| `outputToken` | `Token` | No | `{ address, symbol, decimals, logoUrl? }` |
| `wrappedNativeToken` | `Token \| undefined` | Yes | Host-provided wrapped-native token; pass `undefined` only before a chain is known |
| `inputBalanceRaw` | `string` | No | Raw input-token balance |
| `inputTokenUsdPrice` | `string` | No | USD price of 1 input token |
| `outputTokenUsdPrice` | `string` | No | USD price of 1 output token |
| `callbacks` | `Callbacks` | No | Lifecycle event handlers |
| `displayFeePercent` | `number` | No | Display-only fee estimate percentage; does not collect or subtract fees |
| `overrides` | `Overrides` | No | Initial Spot form state such as default trades, duration, fill delay, trigger price, limit price, and market/limit mode |
| `clientErrorFallback` | `ComponentType<ClientErrorFallbackProps>` | No | DEX-native initialization error component receiving `error`, `retry`, and `isRetrying` |
| `errorFallback` | `ComponentType<SpotErrorFallbackProps>` | No | DEX-native fallback for unexpected calculation or rendering errors |

## WalletInteractions

`spot-react` is wallet-library agnostic. The DEX must pass a `walletInteractions` object that adapts the DEX's existing wallet stack (viem, ethers, web3.js, or another library) to these five methods:

| Method | What to do |
| --- | --- |
| `wrapNativeToken(amountWei)` | Deposit the native token into the chain's wrapped token contract. Wait for confirmation, throw if reverted, return the transaction hash. |
| `approveToken({ tokenAddress, amount, spenderAddress })` | Approve the token for `spenderAddress`. You may approve `amount` or a higher allowance according to DEX policy. Wait for confirmation, throw if reverted, return the transaction hash. |
| `cancelOrder({ order, contractAddress, args, abi })` | Call `cancel` on `contractAddress` using the supplied `abi` and `args`. Wait for confirmation, throw if reverted, return the transaction hash. |
| `signOrder({ signerAddress, typedData })` | Adapt the framework-neutral EIP-712 request to the host wallet and return its original `0x`-prefixed signature. |
| `getAllowance({ tokenAddress, spenderAddress })` | Read ERC-20 allowance for the connected account and return the raw wei value as a string. |

The write methods should not return immediately after wallet submission. Wait for the transaction receipt so Spot can show correct progress and surface reverted transactions as failures.

`typedData` contains the standard EIP-712 `domain`, `types`, `primaryType`, and
`message` fields. `signerAddress` is separate because signer selection is not
part of EIP-712 and wallet libraries accept it differently. Spot forwards the
signature returned by `signOrder` unchanged to order submission. Do not split
it into `{ v, r, s }`, rewrite its recovery byte, or normalize compact and
standard representations.

## Quote, Balance, and Price Inputs

- `marketQuote.quotedOutputAmountRaw` should be the DEX quote output amount for the current `inputAmountUi`, not a standalone token price. The provider converts it into a per-unit market price internally.
- `inputBalanceRaw` is a raw integer string. Pass it from the DEX balance hook so submission state and validation match the swap form.
- `inputTokenUsdPrice` and `outputTokenUsdPrice` are the USD value of one token. They are optional in the type, but real integrations should pass them because loading states, minimum trade size, and review details depend on them.
- Get `chainId` from the connected account/wallet hook wherever Spot needs chain identity. Avoid mixing router, quote, and account chain sources.
- Always pass the `wrappedNativeToken` prop from the DEX's chain configuration. Its value may be `undefined` only before a chain is known; Spot does not maintain a network registry or infer this token.
- `chainId` and `account` may be missing while disconnected. Keep the form rendered; only swap the submit area to the DEX's connect-wallet or switch-network control.
- When `chainId` is missing or unsupported, `SpotProvider` does not initialize a client and submission remains disabled. The DEX UI should show its connect/switch-network control.
- `spot-ui` initializes a client internally using `partner` and the connected supported `chainId`. Do not add a separate configuration fetch or pass the response through DEX context.
- The client owns RePermit-derived order, signing, approval, cancellation, submission, and history values. `SpotProvider` scopes and deduplicates client initialization internally; neither the React package nor the underlying `createClient` factory uses a global cache. A missing client on a supported chain represents initialization loading; pass a localized, DEX-native `clientErrorFallback` so failures remain retryable without passing configuration state through child contexts.
- The SDK rejects configuration chain mismatches and malformed or zero RePermit/adapter addresses. The response still supplies the approval spender, v2 cancellation contract, adapter, reactor, and executor without deployed-bytecode verification, so only use the trusted Orbs endpoint over TLS.
- If the DEX quote result exposes the input amount used for the quote, treat a mismatch with the current typed amount as stale. While stale, omit `marketQuote.quotedOutputAmountRaw` and set `isLoading` to `true`.
- Compute `inputTokenUsdPrice` and `outputTokenUsdPrice` as the USD value of one token. Prefer the DEX's direct one-token USD hook. If unavailable, derive it as `usdAmount / tokenAmount` from the current swap form amounts. Pass strings; omit only when no valid positive value is available.

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
const { returnToOrderForm, startNewOrder, status, isSuccess, isExecuting } =
  useExecution();

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
```

- `returnToOrderForm()` — dismisses a failed/rejected execution while preserving the form and completed wrap metadata for retry; active executions reject the reset
- `startNewOrder()` — resets Spot's internal form and retry state after a terminal execution; active executions reject the reset
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

- Resolve the host setting explicitly; the recommended starting value is 3%
- The unit is percentage: `3` means 3% / 300 basis points, not 3 bps
- This is price protection, not swap slippage
- When Spot is active: hide DEX slippage setting, show only Price Protection
- Persist the same way DEX stores slippage (zustand/redux/localStorage)

`minTradeSizeUsd` must be a positive USD threshold approved for the partner.
The SDK intentionally has no default because this is a product/configuration
decision. `displayFeePercent` only computes the `form.fees` estimate shown in
review UI. Protocol fee collection is configured separately by the partner and
backend.

## Overrides

For initial form state, pass `overrides`:

```tsx
<SpotProvider
  overrides={{
    state: {
      isMarketOrder: false,
      tradeCount: 10,
      limitPriceUi: "1.5",
      triggerPriceUi: "1.2",
      tradeInterval: { value: 5, unit: TimeUnit.Minutes },
      orderDuration: { value: 1, unit: TimeUnit.Days },
    },
  }}
/>
```

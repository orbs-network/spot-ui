# SpotProvider Setup

If no DEX state, wallet, token list, balance service, or quote resource exists, implement the missing host services through [Starting without a DEX](08-starting-without-dex.md) first. The host state below can belong to a new trading form inside an otherwise non-DEX app.

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
| Quote output | DEX quote/router state | Original SDK `SwapQuote` for swaps; current whole-input raw output for advanced adapters |
| Quote freshness | DEX quote request metadata | Whether the quote was produced for the current typed amount/token pair |
| Input balance | DEX balance hook | Raw integer string |
| USD prices | DEX price hooks | USD value of one whole token as a string |
| Chain/account | Connected wallet/account hooks | Connected `chainId` and address |

The provider store stays mounted when tokens or modules change. Spot reapplies
form defaults without refetching the same partner/chain client or discarding
history/cancellation resources. A scope change during execution is deferred
until the frozen attempt reaches a definitive terminal outcome. Unconfirmed
attempts retain their snapshot until reconciliation.

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
  swapQuote,
  isQuoteLoading,
} = dexSwapState;

const marketQuote = useMemo<MarketQuote>(() => {
  const shouldQuote = Boolean(
    inputAmountUi && inputCurrency && outputCurrency,
  );
  const isQuoteStale = shouldQuote && inputAmountUi !== quotedInputAmount;
  const outputAmount = !shouldQuote || isQuoteStale ? undefined : swapQuote?.netAmountOut ?? quoteOutputRaw;
  const isLoading = shouldQuote && (isQuoteStale || isQuoteLoading);

  return {
    quote: !shouldQuote || isQuoteStale ? undefined : swapQuote,
    quotedOutputAmountRaw: outputAmount,
    isLoading,
    noLiquidity: shouldQuote && !isLoading && !outputAmount,
  };
}, [
  inputCurrency,
  isQuoteLoading,
  outputCurrency,
  quoteOutputRaw,
  swapQuote,
  quotedInputAmount,
  inputAmountUi,
]);

// Preserve the selected native/ERC-20 token for display. Native execution uses
// wrappedNativeToken and the shouldWrap/wrapNativeToken wallet callbacks.
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
  shouldWrap: () => dexWallet.shouldWrap(),
  wrapNativeToken: async (amountRaw) => {
    const txHash = await dexWallet.wrapNativeToken(amountRaw);
    await dexWallet.waitForReceipt(txHash);
    return txHash;
  },
  getTokenBalance: ({ tokenAddress }) => dexWallet.getTokenBalance({ tokenAddress }),
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
  // Acceptance only. Keep it silent; swap completion follows settlement.
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

  // Approval
  onWrapRequest: () => {},
  onWrapSuccess: ({ txHash, amount }) => {},
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
| `module` | `Module` | Yes | `SWAP`, `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT` |
| `inputAmountUi` | `string` | Yes | User-entered input-token amount |
| `priceProtectionPercent` | `number` | Yes | Price Protection percentage for advanced orders; ignored for fixed-protection swaps |
| `minTradeSizeUsd` | `number` | Yes | Minimum individual trade size in USD |
| `marketQuote` | `MarketQuote` | Yes | Original SDK `quote` required for swaps; flat current raw/USD fields remain available for advanced adapters, with `isLoading`/`noLiquidity` flags |
| `walletInteractions` | `WalletInteractions` | Yes | Wallet interaction handlers implemented by the DEX |
| `chainId` | `number` | No | Connected chain ID |
| `account` | `Address` | No | Connected wallet address |
| `inputToken` | `Token` | No | `{ address, symbol, decimals, logoUrl? }` |
| `outputToken` | `Token` | No | `{ address, symbol, decimals, logoUrl? }` |
| `wrappedNativeToken` | `Token \| undefined` | Yes | Host metadata for native input normalization and native/wrapped pair detection |
| `inputBalanceRaw` | `string \| undefined` | Yes | Raw input-token balance; `undefined` while disconnected/loading/unavailable, with read errors shown by the host |
| `inputTokenUsdPrice` | `string \| undefined` | Yes | USD price of 1 input token; may be `undefined` when current quote input USD supplies valuation or the price is unavailable |
| `outputTokenUsdPrice` | `string` | No | USD price of 1 output token |
| `callbacks` | `Callbacks` | No | Lifecycle event handlers |
| `displayFeePercent` | `number` | No | Display-only fee estimate percentage; does not collect or subtract fees |
| `overrides` | `Overrides` | No | Initial Spot form state such as default trades, duration, fill delay, trigger price, limit price, and market/limit mode |
| `clientErrorFallback` | `ComponentType<ClientErrorFallbackProps>` | No | DEX-native initialization error component receiving `error`, `retry`, and `isRetrying` |
| `errorFallback` | `ComponentType<SpotErrorFallbackProps>` | No | DEX-native fallback for unexpected calculation or rendering errors |
| `disableAnalytics` | `boolean` | No | Disable SDK telemetry, including active operation reporters, without resetting execution |

## WalletInteractions

`spot-react` is wallet-library agnostic. The DEX must pass a `walletInteractions`
object that adapts its existing wallet stack to six required methods, plus an
optional balance reader required for completed-wrap retries:

| Method | What to do |
| --- | --- |
| `shouldWrap()` | Return a boolean or promise: true wraps native input, false skips wrapping. Called once before allowance reads/writes; errors stop execution. |
| `wrapNativeToken(amountRaw)` | Deposit native base units into the configured wrapped token, wait for a successful receipt, return its hash. |
| `getTokenBalance({ tokenAddress })` | Optional on a first attempt; required to verify live wrapped funds before reusing a completed wrap. Return raw integer balance. |
| `approveToken({ tokenAddress, amount, spenderAddress })` | Approve the token for `spenderAddress`. You may approve `amount` or a higher allowance according to DEX policy. Wait for confirmation, throw if reverted, return the transaction hash. |
| `cancelOrder({ order, contractAddress, args, abi })` | Call `cancel` on `contractAddress` using the supplied `abi` and `args`. Wait for confirmation, throw if reverted, return the transaction hash. |
| `signOrder({ signerAddress, typedData })` | Adapt the framework-neutral EIP-712 request to the host wallet and return its original `0x`-prefixed signature. |
| `getAllowance({ tokenAddress, spenderAddress })` | Read ERC-20 allowance for the connected account and return the raw wei value as a string. |

The write methods should not return immediately after wallet submission. Wait for the transaction receipt so Spot can show correct progress and surface reverted transactions as failures.
Pass the selected input and its current raw balance to `SpotProvider`, including
native selections. For native input, supply the chain's `wrappedNativeToken` and
implement `shouldWrap()` to return true. React normalizes the protocol
input to that ERC-20 address; the shared runner awaits the predicate and the
confirmed `wrapNativeToken` result before signing. ERC-20 selections should return
false. The host still owns balance and gas-fund policy.

`typedData` contains the standard EIP-712 `domain`, `types`, `primaryType`, and
`message` fields. `signerAddress` is separate because signer selection is not
part of EIP-712 and wallet libraries accept it differently. Spot forwards the
signature returned by `signOrder` unchanged to order submission. Do not split
it into `{ v, r, s }`, rewrite its recovery byte, or normalize compact and
standard representations.

## Quote, Balance, and Price Inputs

- For swaps, pass the original SDK quote as `marketQuote: { quote, isLoading, noLiquidity }`. The provider derives output/minimum and USD fields, retaining the exact request for execution refresh. The quote must match the reviewed client, pair, input, and minimum; withhold it while stale/loading. Missing original swap quotes disable submission with `missing-swap-quote`, even when flat amounts exist. Never rebuild the quote from display amounts or apply slippage again. Advanced adapters may continue supplying flat `quotedOutputAmountRaw` and USD fields. See [Swap and Migration](07-swap-and-migration.md).
- `inputBalanceRaw` is a required provider prop whose value is a raw integer string. Pass `undefined` while disconnected, loading, or unavailable; surface read errors in the host UI rather than replacing them with zero.
- `inputTokenUsdPrice` is a required prop whose value may be `undefined`. A current positive input USD total from `marketQuote.quote` or the flat `marketQuote.inputAmountUsd` can satisfy valuation without a separate unit-price source. Otherwise supply a positive, finite one-token USD price; while both are unavailable, the calculated form remains unready. `outputTokenUsdPrice` is optional for display; preserve available quote output/minimum USD totals as well.
- Get `chainId` from the connected account/wallet hook wherever Spot needs chain identity. Avoid mixing router, quote, and account chain sources.
- Pass `wrappedNativeToken` from the DEX's chain configuration for native input normalization and pair detection. Return true from `shouldWrap` for native selections, and implement confirmed wrapping in `wrapNativeToken`.
- `chainId` and `account` may be missing while disconnected. Keep the form rendered; only swap the submit area to the DEX's connect-wallet or switch-network control.
- When `chainId` is missing or unsupported, `SpotProvider` does not initialize a client and submission remains disabled. The DEX UI should show its connect/switch-network control.
- `spot-ui` initializes a client internally using `partner` and the connected supported `chainId`. Do not add a separate configuration fetch or pass the response through DEX context.
- The client owns RePermit-derived order, signing, approval, cancellation, submission, and history values. `SpotProvider` scopes client objects; configuration templates/in-flight requests share a 60-second, 32-entry LRU cache with validated deep copies and failure eviction. Inspect `useClient()` loading and error state to distinguish initialization from failure; pass a localized `clientErrorFallback` for retryable errors.
- The SDK rejects configuration chain mismatches and malformed or zero RePermit/adapter addresses. The response still supplies the approval spender, v2 cancellation contract, adapter, reactor, and executor without deployed-bytecode verification, so only use the trusted Orbs endpoint over TLS.
- If the DEX quote result exposes the input amount used for the quote, treat a mismatch with the current typed amount as stale. While stale, omit `marketQuote.quotedOutputAmountRaw` and set `isLoading` to `true`.
- Compute `inputTokenUsdPrice` and `outputTokenUsdPrice` as the USD value of one token. Prefer the DEX's direct one-token USD hook. If unavailable, derive it as `usdAmount / tokenAmount` from the current swap form amounts. Pass strings; use `undefined` for the required input price while no valid positive value is available, and omit the optional output price in that state.

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
const { returnToOrderForm, startNewOrder, status, isSuccess, isUnconfirmed, canDismiss } =
  useExecution();

const onClose = useCallback(() => {
  if (!canDismiss) return;
  setIsModalOpen(false);
  if (isUnconfirmed) return;
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
}, [canDismiss, isSuccess, isUnconfirmed, returnToOrderForm, setInputAmount, startNewOrder, status]);
```

- `returnToOrderForm()` — dismisses a definitive failure/rejection while preserving the form for retry; active and unconfirmed executions reject the reset
- `startNewOrder()` — resets Spot's internal form and retry state after a confirmed terminal outcome; active and unconfirmed executions reject the reset
- `setInputAmount("")` — only clear the DEX input when the order was successful
- Delay resets briefly so the close animation can finish before state changes

`ExecutionPhase.UNCONFIRMED` retains the existing order/prepared payload and its
captured account/chain after ambiguous submission or stopped/unconfirmed tracking.
It sets `isUnconfirmed: true`, `isExecuting: false`, and `canDismiss: true`.
Closing this view must preserve the input and execution snapshot; fresh
submission and reset stay blocked. Render a `resumeTracking` recovery action
instead of a new confirm button:

```tsx
const { isUnconfirmed, resumeTracking, orderId, account, chainId } = useExecution();
if (isUnconfirmed) {
  return (
    <div role="status">
      <p>Check the previous order before starting another.</p>
      {orderId && <p>Order: {orderId}</p>}
      <p>Account: {account} · Chain: {chainId}</p>
      <button type="button" onClick={resumeTracking}>Check order status</button>
    </div>
  );
}
```

`useExecution().order` holds the accepted order when available. Recovery checks
that order or finds the exact previous prepared payload in the original account
and chain's history; it never signs again. For swaps, a confirmed fill becomes
`SUCCESS`; confirmed cancellation/expiry becomes `FAILED` and permits retry.
Advanced order creation succeeds once acceptance is confirmed. Missing results
and network errors remain `UNCONFIRMED`. `ParsedError.code` retains string SDK
codes or numeric wallet codes, with `0` as fallback; optional `reason`, `orderId`,
HTTP `status`, and `serviceCode` preserve classification details.

Before wallet writes, swap execution captures the original quote and checks it
against the reviewed form/client/pair/input. After confirmed approval it calls
`await client.prepareSwap({ quote, account, signal })`. It checks age
internally, reusing quotes up to 20 seconds old or replaying the same request.
A lower refreshed `minimumAmountOut` rejects with `QUOTE_MINIMUM_DECREASED`.
Both paths retain the original signed minimum and prepare fresh timestamps/nonce;
React attaches the captured form without
preparing a second order. Submission uses a fixed
30-second timeout covering fetch/body reads and forwards the lifecycle signal.
Pre-abort prevents the POST; abort/timeout after sending requires reconciliation,
with no automatic POST retry.

## Balance Refetch

Balance refetching is handled via callbacks, not a prop. Wire `refetchBalances` into:
- `onWrapSuccess` — after native wrapping confirms; keep the native selection stable during execution
- `onOrderCreated` — after the order is accepted by the order sink
- `onOrderFilled` — after an observed order reaches completed status
- `onOrdersProgressUpdate` — when one or more observed orders change fill progress
- `onCancelOrderSuccess` — after cancellation transaction confirms

Avoid showing a toast for `onOrderCreated` unless the host DEX explicitly asks for one. Advanced order creation is shown in the modal; swaps stay in progress after acceptance until filled. Fill and cancel toasts can also be useful outside the modal.

## Price Protection

- Resolve the host setting explicitly; the recommended starting value is 3%
- The unit is percentage: `3` means 3% / 300 basis points, not 3 bps
- This is price protection, not swap slippage
- For advanced order modules: hide DEX slippage and show Price Protection.
- For `Module.SWAP`: show UI Slippage and hide Price Protection. Send the UI slippage percentage in the quote request and use the returned `quote.minimumAmountOut` unchanged. The signed swap oracle-protection field is fixed at 500 bps (5%). Duration is fixed at 3 minutes from preparation and is not editable.
- Pause automatic/manual quotes while `isExecuting`, cancel active quote requests, and resume when it becomes false or on cleanup. An unconfirmed order stays frozen and blocks fresh submission while recovery is available.
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

# AdvancedOrdersProvider Setup

The provider supports only TWAP, Limit, Stop-Loss, and Take-Profit forms. Its
`OrderType` contains only `TWAP`, `LIMIT`, `STOP_LOSS`, and `TAKE_PROFIT`. Swaps use the
[provider-free client flow](07-swap-and-migration.md), with host state and optional
`swap-ui` presentation.

If no DEX state, wallet, token list, balance service, or quote resource exists, implement the missing host services through [Starting without a DEX](08-starting-without-dex.md) first. The host state below can belong to a new trading form inside an otherwise non-DEX app.

## Own DEX Swap State Outside Spot

Keep the DEX swap form as the source of truth for selected tokens, typed input amount, balances, USD amounts, and quotes. Spot should adapt that state; it should not create a parallel swap form store.

Recommended pattern:

1. Read the DEX swap-form hook/context in one small adapter.
2. Expose only the Spot-relevant values through a DEX-owned context if multiple Spot components need them.
3. Have child components call that context/hook directly. Do not pass hook-returned values through intermediate components.
4. Pass all required values directly into `AdvancedOrdersProvider`; avoid a separate `useAdvancedOrdersProviderProps()` hook whose only job is forwarding props.

If child components need many of the same props, stop passing a long prop list and wrap those shared values/actions in a focused local context. The context should hold DEX adapter state, DEX callbacks, formatting helpers, and cross-component UI state; it should not mirror Spot panel values, because children can call the relevant focused Spot hook directly.

The adapter should answer these questions explicitly:

| Value | Source | Shape passed to Spot |
| --- | --- | --- |
| Input/output tokens | DEX token selection state | `Token` objects with `address`, `symbol`, `decimals`, and optional `logoUrl` |
| Wrapped native token | DEX chain configuration | The connected chain's wrapped-native `Token` |
| Typed input amount | DEX input state | User-facing decimal string, e.g. `"1.25"` |
| Quote output | DEX quote/router state | Current whole-input raw output amount and loading/liquidity flags |
| Quote freshness | DEX quote request metadata | Whether the quote was produced for the current typed amount/token pair |
| Input balance | DEX balance hook | Raw integer string |
| USD prices | DEX price hooks | USD value of one whole token as a string |
| Chain/account | Connected wallet/account hooks | Connected `chainId` and address |

The provider store stays mounted when tokens or modules change. Spot reapplies
form defaults without refetching the same partner/chain client or discarding
history/cancellation resources. A form-scope change during execution is deferred
until the frozen attempt finishes or is explicitly detached with `startNewOrder()`.
Unconfirmed attempts retain their snapshot for reconciliation after detachment.
Account, chain, or partner changes quietly dismiss pending wallet work before
submission; uncertain and accepted orders retain their recovery state.

```tsx
function SpotOrderForm({ orderType }: { orderType: OrderType }) {
  return (
    <DexTradingStateProvider>
      <SpotOrderFormContent orderType={orderType} />
    </DexTradingStateProvider>
  );
}

function SpotOrderFormContent({ orderType }: { orderType: OrderType }) {
  const {
    inputCurrency,
    outputCurrency,
    wrappedNativeCurrency,
    inputBalanceRaw,
    inputAmountUi,
    marketQuote,
  } = useDexTradingState();

  return (
    <AdvancedOrdersProvider
      orderType={orderType}
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

Wrap objects with `useMemo` and functions with `useCallback` so AdvancedOrdersProvider does not re-render unnecessarily.

If the DEX returns large objects whose identity changes every render, destructure the primitive fields you need before memoizing and use those primitive fields in dependency arrays. This is especially important for quote state, balances, tokens, callbacks, and wallet adapters.

```tsx
import {
  AdvancedOrdersProvider,
  OrderType,
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

// Preserve the selected native/ERC-20 token for display. Native execution uses
// wrappedNativeToken and the wrapNativeToken/approveToken wallet callbacks.
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
  shouldWrap: () => isNativeInput, // Captured from the DEX selected input.
  wrapNativeToken: async (amountRaw) => {
    const txHash = await dexWallet.wrapNativeToken(amountRaw);
    await dexWallet.waitForReceipt(txHash);
    return txHash;
  },
  shouldApprove: async ({ tokenAddress, amount, spenderAddress }) => {
    const allowance = await dexWallet.getAllowance({ tokenAddress, spenderAddress });
    return BigInt(allowance) < BigInt(amount);
  },
  approveToken: async ({ tokenAddress, approvalAmount, spenderAddress }) => {
    const txHash = await dexWallet.approveToken({
      tokenAddress,
      amount: approvalAmount,
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
}), [dexWallet]);

const callbacks = useMemo<Callbacks>(() => ({
  // Order lifecycle
  // Advanced-order creation succeeds at acceptance; later fills appear in history.
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

<AdvancedOrdersProvider
  partner={Partners.Quick}
  orderType={orderType}
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

The code above assumes a fictional `dexWallet` adapter. Replace it with the DEX's existing wallet/client helpers. Write methods return a transaction hash only after the receipt is confirmed, `shouldApprove` compares allowance with the exact required `amount`, and `signOrder` returns the wallet's original `0x`-prefixed signature. The approval example follows the suggested `approvalAmount`; the host may instead choose an exact cap or its own policy.

Pass a resolved `priceProtectionPercent` number. If the DEX setting has a default, resolve it before rendering `AdvancedOrdersProvider` instead of resolving it inline.

If the DEX quote stores the quoted input amount in raw units instead of the user-facing typed amount, compare against the DEX's current raw source amount instead. Quote freshness checks must compare the same representation.

### Full Props Reference

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `partner` | `Partners` | Yes | DEX partner enum |
| `orderType` | `OrderType` | Yes | `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT`; excludes `SWAP` |
| `inputAmountUi` | `string` | Yes | User-entered input-token amount |
| `priceProtectionPercent` | `number` | Yes | Price Protection percentage for advanced orders |
| `minTradeSizeUsd` | `number` | Yes | Minimum individual trade size in USD |
| `marketQuote` | `MarketQuote` | Yes | Optional `quotedOutputAmountRaw`, `isLoading`, and `noLiquidity` fields |
| `walletInteractions` | `WalletInteractions` | Yes | Wallet interaction handlers implemented by the DEX |
| `chainId` | `number` | No | Connected chain ID |
| `account` | `Address` | No | Connected wallet address |
| `inputToken` | `Token` | No | `{ address, symbol, decimals, logoUrl? }` |
| `outputToken` | `Token` | No | `{ address, symbol, decimals, logoUrl? }` |
| `wrappedNativeToken` | `Token \| undefined` | Yes | Host metadata for native input normalization and native/wrapped pair detection |
| `inputBalanceRaw` | `string \| undefined` | Yes | Raw input-token balance; `undefined` while disconnected/loading/unavailable, with read errors shown by the host |
| `inputTokenUsdPrice` | `string \| undefined` | Yes | USD price of 1 input token; pass `undefined` while unavailable |
| `outputTokenUsdPrice` | `string` | No | USD price of 1 output token |
| `callbacks` | `Callbacks` | No | Lifecycle event handlers |
| `displayFeePercent` | `number` | No | Display-only fee estimate percentage; does not collect or subtract fees |
| `overrides` | `Overrides` | No | Initial Spot form state such as default trades, duration, fill delay, trigger price, limit price, and market/limit mode |
| `errorFallback` | `ComponentType<SpotErrorFallbackProps>` | No | DEX-native initialization and calculation/rendering error UI receiving `error`, `retry`, and `isRetrying` |
| `disableAnalytics` | `boolean` | No | Wrapper passes this flag to client creation; that client's quotes and execution sessions inherit its policy |

`SpotErrorFallbackProps` is `{ error: Error; retry: () => Promise<void>; isRetrying: boolean }`.
Initialization failures keep children mounted alongside the fallback; `retry()`
refetches configuration. Calculation/rendering failures replace the failed subtree
with the same fallback, whose `retry()` resets the boundary. Disable the retry
button while `isRetrying` is true.

## WalletInteractions

`spot-react` is wallet-library agnostic. The DEX must pass a `walletInteractions`
object that adapts its existing wallet stack to six required methods. Balance
and funds decisions stay private to the host's decision/write callbacks:

| Method | What to do |
| --- | --- |
| `shouldWrap()` | Return a boolean or promise from the captured input context; false skips the wrapping write. |
| `wrapNativeToken(amountRaw)` | Confirm the native deposit and return its transaction hash; throw on failure. |
| `shouldApprove(request)` | Compare live allowance with exact required `request.amount`; return a boolean or promise. False skips the approval write. |
| `approveToken({ tokenAddress, amount, approvalAmount, spenderAddress })` | Choose a cap from suggested `approvalAmount`, exact `amount`, or host policy; confirm the write and return its transaction hash. Throw on failure. |
| `cancelOrder({ order, contractAddress, args, abi })` | Call `cancel` on `contractAddress` using the supplied `abi` and `args`. Wait for confirmation, throw if reverted, return the transaction hash. |
| `signOrder({ signerAddress, typedData })` | Adapt the framework-neutral EIP-712 request to the host wallet and return its original `0x`-prefixed signature. |

`ApprovalRequest.amount` is the exact reviewed swap/order input in base units.
`approvalAmount` is a suggested cap defaulting to the maximum uint256 (`2^256 - 1`).
Build a separate host transaction request without mutating the immutable SDK
request. Both initial and post-receipt allowance checks compare only with `amount`;
they never require allowance to reach the suggested cap.

The write methods should not return immediately after wallet submission. Wait for the transaction receipt so Spot can show correct progress and surface reverted transactions as failures.
Pass the selected input and its current raw balance to `AdvancedOrdersProvider`, including
native selections. Supply the chain's `wrappedNativeToken` for protocol execution.
The required `shouldWrap()` and `shouldApprove(request)` callbacks return booleans
or promises from captured input and live host allowance checks. False skips the
corresponding write. Invoked transaction callbacks return confirmed hashes and
throw on failure; they never use undefined to skip. The host owns balance,
wallet-scope, and gas-fund checks; the SDK has no `getAllowance` callback.

`typedData` contains the standard EIP-712 `domain`, `types`, `primaryType`, and
`message` fields. `signerAddress` is separate because signer selection is not
part of EIP-712 and wallet libraries accept it differently. Spot forwards the
signature returned by `signOrder` unchanged to order submission. Do not split
it into `{ v, r, s }`, rewrite its recovery byte, or normalize compact and
standard representations.

## Quote, Balance, and Price Inputs

- `MarketQuote` has exactly three optional fields: `quotedOutputAmountRaw?: string`, `isLoading?: boolean`, and `noLiquidity?: boolean`. Supply the output quoted for the complete current input and withhold stale amounts while loading. If using SDK quotes, map the current `quote.netAmountOut` to `quotedOutputAmountRaw` in the host adapter. The provider does not execute swaps; see [Swap and Migration](07-swap-and-migration.md) for direct client execution.
- `inputBalanceRaw` is a required provider prop whose value is a raw integer string. Pass `undefined` while disconnected, loading, or unavailable; surface read errors in the host UI rather than replacing them with zero.
- Pass USD prices separately from `marketQuote`. `inputTokenUsdPrice` is a required prop whose value may be `undefined` while unavailable; supply a positive, finite one-token price for input valuation. `outputTokenUsdPrice` is optional for advanced-order output display. Swap previews can display SDK quote output/minimum USD totals directly, outside the advanced provider.
- Get `chainId` from the connected account/wallet hook wherever Spot needs chain identity. Avoid mixing router, quote, and account chain sources.
- Pass `wrappedNativeToken` from the DEX's chain configuration for native input normalization and pair detection. Implement `shouldWrap` for captured native input and `shouldApprove(request)` for live host allowance; false skips the corresponding write. Invoked `wrapNativeToken`/`approveToken` callbacks confirm receipts and return hashes.
- `chainId` and `account` may be missing while disconnected. Keep the form rendered; only swap the submit area to the DEX's connect-wallet or switch-network control.
- When `chainId` is missing or unsupported, `AdvancedOrdersProvider` does not initialize a client and submission remains disabled. The DEX UI should show its connect/switch-network control.
- `spot-ui` initializes a client internally using `partner` and the connected supported `chainId`. Do not add a separate configuration fetch or pass the response through DEX context.
- The client owns RePermit-derived order, signing, approval, cancellation, submission, and history values. `AdvancedOrdersProvider` scopes client objects; configuration templates/in-flight requests share a 60-second, 32-entry LRU cache with validated deep copies and failure eviction. Inspect `useClient()` loading and error state to distinguish initialization from failure; pass one localized `errorFallback` for initialization and calculation/rendering failures.
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
const { returnToOrderForm, startNewOrder, status, isSuccess, isExecuting, isUnconfirmed, canDismiss } =
  useExecution();

const onClose = useCallback(() => {
  if (!canDismiss) return;
  setIsModalOpen(false);
  if (isUnconfirmed) return;
  if (isExecuting) {
    if (startNewOrder()) setInputAmount("");
  } else if (isSuccess) {
    setInputAmount("");
    setTimeout(() => {
      startNewOrder();
    }, 500);
  } else if (Boolean(status)) {
    setTimeout(() => {
      returnToOrderForm();
    }, 500);
  }
}, [canDismiss, isExecuting, isSuccess, isUnconfirmed, returnToOrderForm, setInputAmount, startNewOrder, status]);
```

- `returnToOrderForm()` — dismisses a definitive failure/rejection while preserving the form for retry; active and unconfirmed executions reject the reset
- `startNewOrder()` — resets the visible form and execution; active or unconfirmed attempts remain in the background with their original snapshots and callbacks. A stale reset callback returns `false`. A new form needs its own review and never resubmits the retained payload
- `setInputAmount("")` — clear the DEX input after success, or after an explicit new-order action successfully detaches an active or unconfirmed attempt
- Detach active execution immediately; delay terminal resets briefly so the close animation can finish before state changes
- Keep `AdvancedOrdersProvider` mounted while background work should continue; provider unmount aborts its tasks
- `checkOrderStatus()` checks the visible unconfirmed attempt and retained unconfirmed background attempts once, using each original account, chain, and prepared payload; it never resubmits or starts automatic polling
- `hasUnconfirmedExecutions` keeps background recovery visible, including while a check runs; use `isCheckingOrderStatus` to disable the check action until it finishes
- `useSubmitButton().disabledReason === "order-completed"` keeps a successful attempt disabled until `startNewOrder()` opens a new form

Form resets clear visible completed-wrap snapshots. A snapshot matches only the
original input token, raw amount, account, chain, and wrapped token; it does not
prove that wrapped funds remain spendable. Refetch both balances after wrapping.

`ExecutionPhase.UNCONFIRMED` retains the existing order/prepared payload and its
captured account/chain after ambiguous submission or stopped/unconfirmed tracking.
It sets `isUnconfirmed: true`, `isExecuting: false`, and `canDismiss: true`.
Closing this view preserves the input and execution snapshot. Render a status
check and an explicit new-order action. The latter retains the uncertain attempt
in background recovery and lets the user review an independent order even during
a service outage; the original may still complete:

```tsx
const { isUnconfirmed, isCheckingOrderStatus, checkOrderStatus, startNewOrder, orderId, account, chainId } = useExecution();
const onCreateAnotherOrder = () => {
  if (startNewOrder()) setInputAmount("");
};
if (isUnconfirmed) {
  return (
    <div role="status">
      <p>The original order may still complete. Check its status or review another order.</p>
      {orderId && <p>Order: {orderId}</p>}
      <p>Account: {account} · Chain: {chainId}</p>
      <button type="button" onClick={checkOrderStatus} disabled={isCheckingOrderStatus}>Check order status</button>
      <button type="button" onClick={onCreateAnotherOrder}>Create another order</button>
    </div>
  );
}
```

`useExecution().order` holds the visible attempt's accepted order when available.
`checkOrderStatus` performs one-shot status reads for visible and retained background
unconfirmed attempts, or reconciles their exact prepared payloads against each
original account and chain's history. It never signs or creates an execution.
Creation succeeds once acceptance is
confirmed. Missing results and network errors remain `UNCONFIRMED`, including
after the signed deadline. Expiry does not prove that an earlier fill never occurred.
`ParsedError.code` retains string SDK codes or numeric wallet codes, with `0`
as fallback; optional `reason`, `orderId`, HTTP `status`, and `serviceCode` preserve
classification details.

Advanced execution captures the reviewed form before wallet work. After confirmed
wrapping/approval it prepares fresh order timestamps, signs, and submits once.
Submission uses a fixed 30-second timeout covering fetch/body reads and forwards
the lifecycle signal. Pre-abort prevents the POST; abort/timeout after sending
requires reconciliation, with no automatic POST retry.

## Balance Refetch

Balance refetching is handled via callbacks, not a prop. Wire `refetchBalances` into:
- `onWrapSuccess` — after native wrapping confirms; keep the native selection stable during execution
- `onOrderCreated` — after the order is accepted by the order sink
- `onOrderFilled` — after an observed order reaches completed status
- `onOrdersProgressUpdate` — when one or more observed orders change fill progress
- `onCancelOrderSuccess` — after cancellation transaction confirms

Avoid showing a toast for `onOrderCreated` unless the host DEX explicitly asks for one; advanced-order creation is already shown in the modal. Fill and cancel toasts can be useful for later history events.

## Price Protection

- Resolve the host setting explicitly; the recommended starting value is 3%
- The unit is percentage: `3` means 3% / 300 basis points, not 3 bps
- This is price protection, not swap slippage
- For advanced order modules: hide DEX slippage and show Price Protection.
- Swap UI Slippage belongs to the separate provider-free client flow; see [Swap and Migration](07-swap-and-migration.md).
- Pause automatic/manual quotes while the visible attempt is executing, cancel active quote requests, and resume after `startNewOrder()` releases the form or on cleanup. A visible unconfirmed order stays frozen until reconciliation or an explicit new-order action retains it in the background.
- Persist the same way DEX stores slippage (zustand/redux/localStorage)

`minTradeSizeUsd` must be a positive USD threshold approved for the partner.
The SDK intentionally has no default because this is a product/configuration
decision. `displayFeePercent` only computes the `form.fees` estimate shown in
review UI. Protocol fee collection is configured separately by the partner and
backend.

## Overrides

For initial form state, pass `overrides`:

```tsx
<AdvancedOrdersProvider
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

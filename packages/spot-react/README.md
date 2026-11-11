# @orbs-network/spot-react

Headless React SDK for TWAP, Limit, Stop-Loss, and Take-Profit order forms,
plus the public Spot client APIs for provider-free swaps.

`AdvancedOrdersProvider` owns advanced-order form, execution, and history state.
Its `orderType` accepts only `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT`.
Swaps call the client directly and use the DEX's existing form, state, wallet,
and modal; `@orbs-network/swap-ui` is an optional presentation layer for either flow.

| I'm building… | Use… |
| --- | --- |
| An advanced React order form | `AdvancedOrdersProvider` and focused hooks such as `useExecution()` |
| A swap with SDK wallet orchestration | `client.getQuote` → review → `client.createSwapExecution(params).run()`; no provider |
| A DEX router that controls wallet steps | Create one swap execution and await its `wrap`/`approve`/`sign`/`submit`/`waitForCompletion` methods; no provider |

Every path can import its SDK functions and types from `spot-react` alone.
The underlying `spot-ui` package is framework-neutral and renders no components.
There is no swap provider. `AdvancedOrdersProviderProps` uses the exported
`OrderType` enum: `TWAP`, `LIMIT`, `STOP_LOSS`, and `TAKE_PROFIT`.
Swaps use the quote-only client flow and have no high-level order type.

For AI-assisted integration, describe the requested features to your coding agent
and have it read
`node_modules/@orbs-network/spot-react/dist/integration-skill/SKILL.md`.
The bundled guide's `manifest.json` records the matching `sdkVersion`. The agent
discovers the host's wallet, components, state, and networks, selects a focused
path, and asks only unresolved product questions.
If there is no DEX yet, its starting path covers the missing wallet, token list,
balances, quote/USD data, and React trading form before provider setup.

For the complete integration workflow, see the [Spot React integration skill](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-react-integration) and the [reference implementation](https://github.com/orbs-network/spot-ui/blob/master/apps/web/components/spot/spot-form.tsx).

Client and history resources are configured once per provider and share its cache.
Failed legacy-history requests remain eligible for retry, and cached
legacy orders remain visible during an outage. Execution analytics belong to
the provider's client.

The SDK reports its own configuration, quote, wallet, submission, cancellation,
swap settlement, status checks, and crash outcomes as separate event records. Advanced
order creation finishes at submission, with later fills available in history.
Request and preparation events capture account/token/amount context; subsequent events carry
their own outcome rather than the accumulated history. Submission acceptance is
recorded as `submission.succeeded`, separately from `settlement.filled` for a
completed swap. Each event includes only applicable fields, without duplicate
action, phase, or success/status flags.
Log values are flat strings, finite numbers, or booleans; nested objects and
arrays are never emitted.
`sessionId` connects those operations across clients and wallet/chain changes
within one page load. Refreshing the page starts a new session. Every event has a
unique `_id`, a shared `operationId` for its attempt, an `eventName`, and `eventTimestampMillis`.
`eventSequence` orders steps within an operation, including rapid transitions.

The `disableAnalytics` prop on `AdvancedOrdersProvider` maps to
`createClient(..., { disableAnalytics })` when the wrapper creates its client.
All quotes and execution sessions use their owning client's policy; there are
no per-operation or saved-order overrides. For direct SDK use, configure the
option on `createClient` and use `client.getQuote`. Host lifecycle callbacks do
not need to duplicate SDK telemetry.

## Before You Start

The host owns partner discovery and chain selectors. Client initialization reads
and validates the order-sink `/config` response directly and exposes failures
through `useClient()` and `errorFallback`. Analytics contract metadata also
comes from this validated response; initialization failures retain the requested
partner/chain context. The demo's GitHub partner-list fetch is
local to the web app and is not an SDK dependency.

Every DEX needs a member of the exported `Partners` enum and a server-side Orbs Spot configuration for its supported chains. The SDK fetches contract and adapter addresses from that configuration. If the DEX is not configured yet, contact [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup) before integrating.

### RePermit configuration security

The `/config` endpoint is a security boundary. The SDK rejects configurations whose domain or order chain differs from the requested chain, and rejects zero or malformed RePermit and exchange-adapter addresses. It uses `domain.verifyingContract` as the ERC-20 approval spender and the v2 cancellation contract, and uses the returned adapter, reactor, and executor when constructing orders. The SDK does not independently verify deployed bytecode or contract identity, so deployments must use the trusted Orbs endpoint over TLS and contract-address changes require explicit approval from the protocol/security owner.

`AdvancedOrdersProvider` initializes the `spot-ui` client when a valid connected chain ID is
available; the service determines partner/chain support. Client and history state
are provider-scoped and require no host query provider. `createClient` returns a
new client while sharing validated configuration templates and in-flight requests
through a 60-second, 32-entry LRU cache. Each client receives a deep copy; failures
are evicted. Analytics initialize after validation, without an `appId` or React
effect. Nonce allocation is shared across clients in the loaded SDK instance.

The client owns configuration-dependent preparation, signing/approval/cancellation
requests, submission, and history access. Package-level `calculateOrder` provides
the shared form model. Execution sessions prepare fresh start, deadline, and nonce
inside `sign()`, after confirmed wrapping/approval. Swap sessions reuse the reviewed
quote when its local receipt age is between zero and 20 seconds, inclusive. Older
quotes, invalid receipt times, and future receipt times trigger a refresh for the
exact original request. A refreshed minimum below the reviewed floor rejects with
`QUOTE_MINIMUM_DECREASED` and requires fresh review; otherwise, the selected quote
and its minimum become the prepared order. Swap display quotes may
remain live through wrapping/approval. Freeze the displayed output and minimum
from `preparedOrder.quote` before signing, then keep them fixed through submission.

Initialization is retried twice. After those retries, the provider keeps children
mounted and renders `errorFallback` alongside them. The same component handles
calculation/rendering failures. It receives `SpotErrorFallbackProps`: `error: Error`,
`retry: () => Promise<void>`, and `isRetrying: boolean`. Retry refetches configuration
for initialization failures or resets the error boundary for rendering failures.
Supply the component to localize and style both cases.

The authoritative shared model is available from `useOrderForm()`.

Each mounted `AdvancedOrdersProvider` owns one stable store. Changing the order type or token
pair reapplies form defaults without recreating the partner/chain client,
history cache, or cancellation state. If that scope changes during execution,
the reset waits until the frozen execution finishes or the user explicitly calls
`startNewOrder()`; unconfirmed attempts remain available for reconciliation in
the background after that action. Changing
partner or chain reconfigures only the resources whose keys actually changed.

Changing `overrides.state` updates defaults for future form resets without wiping
current fields or execution results. Execution belongs to the provider and
continues when a submitting control unmounts. Account, chain, or partner changes
quietly dismiss pending wallet work before submission, without a failure callback;
confirmed transactions remain valid. Submitted or uncertain orders retain their
recovery state. Provider unmount stops its tasks.

The completed integration should:

- keep tokens, typed amount, balances, USD prices, and quote state in the DEX's existing swap store or context;
- provide the six required `walletInteractions` methods using the DEX's existing wallet stack;
- render the requested order types using DEX-native navigation and components;
- reuse the host's review/progress UI, or adapt `@orbs-network/swap-ui` inside the DEX's modal shell;
- when history is requested, render it and cancellation inside `AdvancedOrdersProvider` scope or through a context-preserving portal.

## Installation

`spot-react` includes `spot-ui` as a dependency and re-exports all of its public
functions and types. Install only `spot-react` for the SDK and hooks; add
`swap-ui` when using its order progress components.

Inspect installed versions first and preserve a compatible installation. When the
SDK is missing, check its peer requirements and use the host application's package
manager. Commit the resulting lockfile; do not mix package managers.

```bash
npm install @orbs-network/spot-react
# or: pnpm add @orbs-network/spot-react
# or: yarn add @orbs-network/spot-react
```

Add a compatible `@orbs-network/swap-ui` only if using its progress components.
If migrating from `@orbs-network/twap-ui`, remove the old package after replacing
its imports and verifying the new integration.

### Migrating from 1.x

Version 2 is a deliberately breaking, headless API. Replace the broad `useSpot`
and `useSwapExecution` interfaces with focused hooks such as `useOrderForm`,
`useExecution`, `useSubmitButton`, and `useOrders`. Provider values now use
`input`/`output` terminology (`inputToken`, `outputToken`, `inputBalanceRaw`,
and `minTradeSizeUsd`), and the host supplies wallet operations through
`walletInteractions`. The `isDev` option and `?devurl=true` backend selection are
no longer supported. Direct SDK clients can select a trusted endpoint with
`createClient(partner, chainId, { apiUrl })`; the provider uses production.

For current order naming, replace the former `Module` with `OrderType` and the
provider's `module` prop with `orderType`. Use the four-value `OrderType` enum
directly instead of `AdvancedOrderModule`. The former detailed `OrderType` is
now `OrderVariant`; calculated forms expose `form.orderType` and
`form.values.orderVariant`, while history retains `Order.type: OrderVariant`.
Swaps use quote/token previews and `client.createSwapExecution`, outside the calculator
and advanced provider. See the [SDK naming migration](../spot-ui/README.md#order-naming-migration).

`@orbs-network/swap-ui` is a recommended companion for the documented order
progress modal, but it is not imported by `spot-react` and is not required for
a headless or custom-progress integration.

### Peer Dependency

The host application must provide React. Zustand is an internal runtime
dependency of `spot-react`; integrators do not install or configure it.

| Package | Version |
| --- | --- |
| `react` | `^18 \|\| ^19` |

`viem` is not a dependency. Adapt the wallet library already used by the DEX through `walletInteractions`.

The published entry includes a `"use client"` directive, so it can be imported
directly from a Next.js App Router client component.

## Integration Model

Keep the DEX swap form as the source of truth. Pass the following adapted values directly to `AdvancedOrdersProvider`:

| Value | Expected shape |
| --- | --- |
| Selected tokens | `Token` objects with `address`, `symbol`, `decimals`, and optional `logoUrl` |
| Wrapped native token | The connected chain's wrapped-native `Token`, supplied by the DEX |
| Typed source amount | User-facing decimal string, for example `"1.25"` |
| Quote output | Current whole-input raw output amount and loading/liquidity flags |
| Input balance | Raw integer string |
| USD prices | USD value of exactly one whole source/destination token |
| Chain and account | Values from the connected wallet/account state |

If several Spot components need the same DEX-owned values, expose a small DEX adapter context. Do not copy the swap state into a parallel Spot store, prop-drill long value lists, or create a hook whose only purpose is forwarding props to `AdvancedOrdersProvider`.

Memoize objects with `useMemo` and functions with `useCallback`. In particular, keep stable identities for selected tokens, `wrappedNativeToken`, `marketQuote`, `walletInteractions`, and `callbacks`.

## Provider Setup

```tsx
import { useMemo } from "react";
import {
  type SpotErrorFallbackProps,
  type OrderType,
  Partners,
  AdvancedOrdersProvider,
  type Callbacks,
  type MarketQuote,
  type Token,
  type WalletInteractions,
} from "@orbs-network/spot-react";

function ErrorFallback({
  error,
  retry,
  isRetrying,
}: SpotErrorFallbackProps) {
  return (
    <div role="alert">
      <p>{getLocalizedErrorMessage(error)}</p>
      <button type="button" disabled={isRetrying} onClick={retry}>
        {isRetrying ? t("retrying") : t("retry")}
      </button>
    </div>
  );
}

function SpotOrderForm({ orderType }: { orderType: OrderType }) {
  // Read these from the DEX's existing swap and wallet state.
  const {
    account,
    chainId,
    inputCurrency,
    outputCurrency,
    wrappedNativeCurrency,
    inputBalanceRaw,
    inputAmountUi,
    quotedInputAmountUi,
    quotedOutputAmountRaw,
    isQuoteLoading,
    inputTokenUsdPrice,
    outputTokenUsdPrice,
    refetchBalances,
    dexWallet,
  } = useDexSpotAdapter();

  // Preserve the selected native/ERC-20 token for display. Native execution uses
  // wrappedNativeToken and the wrapNativeToken/approveToken wallet callbacks.
  const inputToken = useMemo<Token | undefined>(() => {
    if (!inputCurrency) return undefined;
    return {
      address: inputCurrency.address,
      symbol: inputCurrency.symbol,
      decimals: inputCurrency.decimals,
      logoUrl: inputCurrency.logoUrl,
    };
  }, [inputCurrency]);

  const outputToken = useMemo<Token | undefined>(() => {
    if (!outputCurrency) return undefined;
    return {
      address: outputCurrency.address,
      symbol: outputCurrency.symbol,
      decimals: outputCurrency.decimals,
      logoUrl: outputCurrency.logoUrl,
    };
  }, [outputCurrency]);

  const wrappedNativeToken = useMemo<Token | undefined>(() => {
    if (!wrappedNativeCurrency) return undefined;
    return {
      address: wrappedNativeCurrency.address,
      symbol: wrappedNativeCurrency.symbol,
      decimals: wrappedNativeCurrency.decimals,
      logoUrl: wrappedNativeCurrency.logoUrl,
    };
  }, [wrappedNativeCurrency]);

  const marketQuote = useMemo<MarketQuote>(() => {
    const shouldQuote = Boolean(
      inputAmountUi && inputCurrency && outputCurrency,
    );
    const isStale = shouldQuote && inputAmountUi !== quotedInputAmountUi;
    const currentQuotedOutputAmountRaw =
      !shouldQuote || isStale ? undefined : quotedOutputAmountRaw;
    const isLoading = shouldQuote && (isStale || isQuoteLoading);

    return {
      quotedOutputAmountRaw: currentQuotedOutputAmountRaw,
      isLoading,
      noLiquidity:
        shouldQuote && !isLoading && !currentQuotedOutputAmountRaw,
    };
  }, [
    inputCurrency,
    isQuoteLoading,
    outputCurrency,
    quotedOutputAmountRaw,
    quotedInputAmountUi,
    inputAmountUi,
  ]);

  const walletInteractions = useMemo<WalletInteractions>(
    () => createWalletInteractions(dexWallet),
    [dexWallet],
  );

  const callbacks = useMemo<Callbacks>(
    () => ({
      onWrapSuccess: () => refetchBalances(),
      onOrderCreated: () => refetchBalances(),
      onOrderFilled: () => refetchBalances(),
      onOrdersProgressUpdate: () => refetchBalances(),
      onCancelOrderSuccess: () => refetchBalances(),
    }),
    [refetchBalances],
  );

  return (
    <AdvancedOrdersProvider
      partner={Partners.Quick}
      orderType={orderType}
      inputAmountUi={inputAmountUi}
      priceProtectionPercent={3}
      minTradeSizeUsd={5}
      marketQuote={marketQuote}
      walletInteractions={walletInteractions}
      chainId={chainId}
      account={account}
      inputToken={inputToken}
      outputToken={outputToken}
      wrappedNativeToken={wrappedNativeToken}
      inputBalanceRaw={inputBalanceRaw}
      inputTokenUsdPrice={inputTokenUsdPrice}
      outputTokenUsdPrice={outputTokenUsdPrice}
      callbacks={callbacks}
      errorFallback={ErrorFallback}
      displayFeePercent={0.25}
    >
      <SpotFormContent />
    </AdvancedOrdersProvider>
  );
}
```

`MarketQuote` has exactly three optional fields: `quotedOutputAmountRaw?: string`,
`isLoading?: boolean`, and `noLiquidity?: boolean`. Supply the raw output quoted
for the complete current input amount. Token USD prices use the separate
`inputTokenUsdPrice` and `outputTokenUsdPrice` provider props.

If the host uses SDK quotes, map the current quote in its adapter before passing
the plain bridge to the provider:

```ts
const marketQuote: MarketQuote = {
  quotedOutputAmountRaw: currentQuote?.netAmountOut,
  isLoading: isQuoteLoading,
  noLiquidity,
};
```

Keep quote request identity in the host. Withhold stale quote amounts and show
`isLoading: true` while replacing them. The provider derives the market rate from
the raw input/output pair and USD values from the supplied unit prices. Swaps use
the [provider-free client flow](#swaps-without-a-provider) with their original SDK quote.

`spot-react` has no network registry. Always pass the `wrappedNativeToken` prop
from the DEX's own chain configuration; its value may be `undefined` only until
a chain is known. It supports native/wrapped pair detection for host UI; it
normalizes native execution to the wrapped ERC-20 address. `shouldWrap()` decides
whether the session invokes `wrapNativeToken`. Explorer links are also host-owned; callbacks
and history values expose transaction hashes so the DEX can format links with
its existing chain metadata.

Use the connected wallet chain as the source of truth. When it is absent or unsupported, the provider does not initialize a client and submission stays disabled. The DEX submit area should show its connect-wallet or switch-network control.

### AdvancedOrdersProvider Props

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `partner` | `Partners` | Yes | DEX partner enum |
| `orderType` | `OrderType` | Yes | `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT`; excludes `SWAP` |
| `inputAmountUi` | `string` | Yes | User-entered input-token amount |
| `priceProtectionPercent` | `number` | Yes | Price Protection percentage for advanced orders |
| `minTradeSizeUsd` | `number` | Yes | Minimum individual trade size in USD |
| `marketQuote` | `MarketQuote` | Yes | `quotedOutputAmountRaw`, `isLoading`, and `noLiquidity`; all three fields are optional |
| `walletInteractions` | `WalletInteractions` | Yes | Six required wallet methods implemented by the DEX |
| `chainId` | `number` | No | Connected wallet chain ID |
| `account` | `Address` | No | Connected wallet address |
| `inputToken` | `Token` | No | Input token metadata |
| `outputToken` | `Token` | No | Output token metadata |
| `wrappedNativeToken` | `Token \| undefined` | Yes | Host metadata for native input normalization and native/wrapped pair detection |
| `inputBalanceRaw` | `string \| undefined` | Yes | Raw input-token balance; pass `undefined` while disconnected or loading |
| `inputTokenUsdPrice` | `string \| undefined` | Yes | USD value of one whole input token; pass `undefined` while loading |
| `outputTokenUsdPrice` | `string` | No | USD value of one whole output token |
| `callbacks` | `Callbacks` | No | Lifecycle and field-change callbacks |
| `displayFeePercent` | `number` | No | Display-only fee estimate percentage; does not collect or subtract fees |
| `supportLegacyOrders` | `boolean` | No | Include supported legacy v1 orders in history |
| `disableAnalytics` | `boolean` | No | Passed to client creation to disable its SDK telemetry; defaults to `false` |
| `errorFallback` | `ComponentType<SpotErrorFallbackProps>` | No | Host-rendered initialization and calculation/rendering error UI with `error`, `retry`, and `isRetrying` |

`inputBalanceRaw` and `inputTokenUsdPrice` are required provider props; pass
`undefined` only while their values are genuinely unavailable. The output-token
USD price remains optional because it is used for display details rather than
submission readiness.
These required keys make host ownership explicit while allowing disconnected or
loading states; use the same pattern for `wrappedNativeToken` before a chain is known.

`minTradeSizeUsd` must be a positive USD threshold approved for the partner;
there is intentionally no SDK default. `priceProtectionPercent` uses percentage
units, so `3` means 3% (300 bps). `displayFeePercent` only populates `form.fees`
for the review UI. Protocol fee collection is configured separately by the
partner and backend.

## WalletInteractions

`WalletInteractions` extends the SDK's `OrderWalletInteractions` with
`cancelOrder`; one wallet adapter can support both SDK orchestration and React
history. The `ApproveTokenProps` and `CancelOrderProps`
aliases remain available for existing adapters.

The DEX must implement the six required methods. Write methods must wait
for the transaction receipt, throw when the transaction reverts, and then return
the transaction hash.

```tsx
const walletInteractions: WalletInteractions = {
  // The DEX decides from the captured selected token/account/chain.
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

  cancelOrder: async ({ order, contractAddress, args, abi }) => {
    const txHash = await dexWallet.writeContract({
      address: contractAddress,
      abi,
      functionName: "cancel",
      args,
    });
    await dexWallet.waitForReceipt(txHash);
    return txHash;
  },

  signOrder: ({ signerAddress, typedData }) =>
    dexWallet.signTypedData({ ...typedData, account: signerAddress }),

};
```

| Method | Contract |
| --- | --- |
| `shouldWrap()` | Return a boolean or promise from the captured input context; false skips the wrapping write. |
| `wrapNativeToken(amountRaw)` | Confirm the native deposit and return its transaction hash; throw on failure. |
| `shouldApprove(request)` | Compare live allowance with the exact required `request.amount`; return a boolean or promise. False skips the approval write. |
| `approveToken({ tokenAddress, amount, approvalAmount, spenderAddress })` | Choose a cap from the suggested `approvalAmount`, exact `amount`, or host policy; confirm approval and return its transaction hash. Throw on failure. |
| `cancelOrder({ order, contractAddress, args, abi })` | Call `cancel` with the supplied ABI and args, wait for confirmation, return tx hash |
| `signOrder({ signerAddress, typedData })` | Adapt the framework-neutral EIP-712 request to the host wallet and return its original `0x`-prefixed signature |

`ApprovalRequest.amount` is the exact reviewed swap/order input in token base
units. `approvalAmount` is a suggested cap, defaulting to the maximum uint256
(`2^256 - 1`). The example follows that suggestion; a host may instead pass
`amount` exactly or apply its own cap policy. Build a separate host transaction
request without mutating the immutable SDK request. Check allowance against
`amount` only, including after approval receipts; it need not reach the suggested cap.

The signature returned by `signOrder` is submitted unchanged. Do not split it into `{ v, r, s }`, rewrite its recovery byte, or otherwise normalize the wallet's byte representation.
Pass the selected input and its current raw balance to `AdvancedOrdersProvider`, including
native selections. For native input, supply `wrappedNativeToken`. The host's
`shouldWrap()` checks the captured input and `shouldApprove(request)` reads live
host allowance. Both return a boolean or promise; false skips the corresponding
write. When invoked, `wrapNativeToken` and `approveToken` return confirmed hashes
and throw on failure. There is no SDK `getAllowance` callback or undefined skip
result from transaction callbacks. The user reviews first.

## Building with focused hooks

Import only the hooks each component needs. Leaf components should call the
smallest hook that provides what they render:

```tsx
import {
  useExecution,
  useLimitPrice,
  useOrderForm,
  useOrders,
  useOutputAmount,
  usePriceDisplay,
  useTrades,
} from "@orbs-network/spot-react";

const calculatedForm = useOrderForm();
const tradesPanel = useTrades();
const limitPricePanel = useLimitPrice();
const outputAmount = useOutputAmount();

const execution = useExecution();
const history = useOrders();
```

`useOrderForm()` reads the calculated form shared by `OrderFormProvider`; it does not rerun the calculation. The other hooks expose smaller panel contracts for clearer component code. They currently share the same calculated-form context, so a form update can rerender every mounted form-panel hook.

| Value | Key returns |
| --- | --- |
| `useOutputAmount()` | `amount: { raw, ui, usd }`, `isLoading` |
| `useTrades()` | `totalTrades`, `maxTrades`, `onChange`, `error`, structured input/min-output/trigger-output amounts, input/output tokens |
| `useDuration()` | `duration`, input/unit callbacks, `milliseconds`, `error` |
| `useFillDelay()` | `fillDelay`, input/unit callbacks, `milliseconds`, `error` |
| `useLimitPrice()` | `price: { raw, ui, usd }`, canonical raw price, percentage, enable/toggle actions, tokens, loading/error state |
| `useTriggerPrice()` | `price: { raw, ui, usd }`, canonical raw price, percentage, structured output-per-trade amount, tokens, loading/error state |
| `usePriceDisplay()` | Inversion state/callback, actual and display-direction tokens, market-order state |
| `useDisclaimer()` | Disclaimer translation key or `undefined` |
| `useInputErrors()` | `{ type, args }` or `undefined` |
| `useSubmitButton()` | `disabled`, `loading`, and an actionable `disabledReason` |
| `useExecution()` | Submission/status checks, status, steps, errors, retained order/account, resets, resolved tokens, and tx hashes |
| `useOrders()` | Provider-scoped categorized order lists and polling state |
| `useHistoryOrder()` | Display-ready values for one history order |
| `useCancelOrder()` | Per-order cancellation state and action |
| `useClient()` | Provider-scoped initialized client state |
| `useAmountUi()` | Raw-token amount formatting |

Child components should call the relevant focused hook themselves instead of receiving hook-returned panels through intermediate props. `useOrders()` activates order-history fetching while an orders consumer is mounted; form-only integrations do not fetch or poll history.

Keep the submit button disabled while `loading` is true. If client initialization fails, `AdvancedOrdersProvider` keeps child components mounted and renders the retryable `errorFallback` alongside them. Calculation/rendering failures use the same fallback in place of the failed subtree.

`useSubmitButton()` returns the exported `SubmitButtonResult` type. When
`disabled` is true, `disabledReason` is a stable `SubmitDisabledReason`; when
enabled, no reason is present. Translate these codes with the host's existing UI and use them for
agent diagnostics instead of reconstructing the SDK's readiness logic.

| Reason | Integration action |
| --- | --- |
| `execution-in-progress` | Block duplicate starts for the visible attempt; `startNewOrder()` can release the form while it continues |
| `unconfirmed-order` | Check the captured order with `checkOrderStatus()`, or explicitly call `startNewOrder()` to retain it in the background and review another order |
| `order-completed` | Call `startNewOrder()` before submitting another reviewed order |
| `missing-chain` | Use the host's connect/switch-network flow |
| `client-loading`, `client-error`, `client-unavailable` | Inspect `useClient()` and its retryable initialization state |
| `missing-token-metadata` | Supply the host's selected-token metadata |
| `missing-wrapped-native-token` | Supply the connected chain's wrapped-token metadata for the selected native input |
| `quote-loading`, `awaiting-quote`, `no-liquidity` | Inspect the current pair's quote resource |
| `balance-loading` | Supply the connected account's raw input-token balance |
| `empty-input`, `missing-usd-value` | Correct the prerequisite identified by `form.notReadyReason` |
| `validation-error` | Read `useOrderForm().errors.primary` or `useInputErrors()` |
| `form-not-ready`, `form-not-submittable` | Inspect the complete form and installed SDK contract before choosing a recovery |

`form.notReadyReason` describes missing calculation prerequisites; it is absent
for ready forms that fail validation. Neither diagnostic changes the host's
responsibility for wallet connection, translations, or product policy.

### Trade-count validation behavior

An explicitly selected TWAP trade count persists when `inputAmountUi` changes. If lowering the amount makes that count greater than the newly calculated `maxTrades`, Spot does not clamp or reset it: `useTrades().error` and `useInputErrors()` report `InputErrors.MAX_TRADES`, and submission remains disabled until the user selects a valid count. This is an intentional behavior change from integrations that silently reset the trade count on every amount edit. Hosts should render the returned validation error so the user can correct the value.

### Panel Visibility

| Panel | TWAP | LIMIT | STOP_LOSS | TAKE_PROFIT |
| --- | --- | --- | --- | --- |
| Trades amount | Yes | — | — | — |
| Fill delay | Yes | — | — | — |
| Duration | — | Yes | Yes | Yes |
| Limit price | Yes, optional | Always on | Optional | Optional |
| Trigger price | — | — | Yes | Yes |

Use `TimeUnit.Minutes`, `TimeUnit.Hours`, and `TimeUnit.Days` for duration and fill-delay controls. Resolve error and disclaimer keys through the DEX's i18n system.

### Display Amounts

Every calculated amount uses the same `{ raw, ui, usd }` shape. Convert `raw`
into the DEX's native amount type before display when possible:

```tsx
const amount = CurrencyAmount.fromRawAmount(
  inputCurrency,
  tradesPanel.inputAmountPerTrade.raw,
);

return `${amount.toSignificant()} ${inputCurrency.symbol}`;
```

Use `.ui` for editable text inputs or when the DEX has no amount object. Do not
format `.raw` integer strings directly for user display.

## Submit and Progress Modal

Use `useExecution()` for execution state, `useOrderForm()` for review details, and `@orbs-network/swap-ui`'s `SwapFlow` for the creation/progress UI.

```tsx
import { SwapFlow, SwapStatus as SwapUiStatus } from "@orbs-network/swap-ui";
import {
  ExecutionStatus,
  useExecution,
  useOrderForm,
} from "@orbs-network/spot-react";

function SpotOrderFlow() {
  const {
    status,
    error,
    inputToken,
    outputToken,
    currentStepIndex,
    totalSteps,
    isUnconfirmed,
    checkOrderStatus,
    orderId,
  } = useExecution();
  const form = useOrderForm();
  if (isUnconfirmed) {
    return (
      <div role="status">
        <p>{error?.message || "Order status needs confirmation."}</p>
        {orderId && <p>Order: {orderId}</p>}
        <button type="button" onClick={checkOrderStatus}>Check order status</button>
      </div>
    );
  }
  const swapStatus =
    status === ExecutionStatus.SUCCESS
      ? SwapUiStatus.SUCCESS
      : status === ExecutionStatus.FAILED
        ? SwapUiStatus.FAILED
        : status === ExecutionStatus.LOADING
          ? SwapUiStatus.LOADING
          : undefined;

  return (
    <SwapFlow
      inAmount={form.inputAmount.ui}
      outAmount={form.outputAmount.ui}
      inToken={{ symbol: inputToken?.symbol, logoUrl: inputToken?.logoUrl }}
      outToken={{ symbol: outputToken?.symbol, logoUrl: outputToken?.logoUrl }}
      swapStatus={swapStatus}
      currentStepIndex={currentStepIndex}
      totalSteps={totalSteps}
      components={{
        Main: <SwapFlow.Main inUsd={form.inputAmount.usd} outUsd={form.outputAmount.usd} />,
        Success: <SwapFlow.Success title="Order created" />,
        Failed: <SwapFlow.Failed error={error?.message} />,
      }}
    />
  );
}
```

Wrap `SwapFlow` in the DEX's modal shell and skin it with DEX colors, surfaces, typography, token logos, and loaders. Once `useExecution().status` is set, hide the review details, confirm button, duplicate title, and secondary footer actions so the progress/success/failure content owns the modal.

### Execution State and Reset

`useExecution()` returns:

- `submitOrder`, `checkOrderStatus`, `phase`, `status`, `isExecuting`, `isUnconfirmed`, `hasUnconfirmedExecutions`, `isCheckingOrderStatus`, `isSuccess`, `isFailed`, `isRejected`, `isPreparingOrder`, and `canDismiss`;
- `currentStep`, `currentStepIndex`, `totalSteps`, and `executionSteps`;
- `error`, `order`, `orderId`, `account`, `inputToken`, `outputToken`, `chainId`, `wrapTxHash`, and `approvalTxHash`;
- `returnToOrderForm()` and `startNewOrder()`.

`spot-react` does not clear the DEX input. Clear it after success or when the user
explicitly starts a new order while the previous attempt continues:

```tsx
const { status, isSuccess, isExecuting, isUnconfirmed, canDismiss, returnToOrderForm, startNewOrder } =
  useExecution();

const onClose = useCallback(() => {
  if (!canDismiss) return;
  setIsModalOpen(false);
  if (isUnconfirmed) return;

  if (isExecuting) {
    if (startNewOrder()) setInputAmount("");
  } else if (isSuccess) {
    setInputAmount("");
    setTimeout(startNewOrder, 500);
  } else if (status) {
    setTimeout(returnToOrderForm, 500);
  }
}, [canDismiss, isExecuting, isSuccess, isUnconfirmed, returnToOrderForm, setInputAmount, startNewOrder, status]);

// Bind this to an explicit "Create another order" action for an uncertain attempt.
const onCreateAnotherOrder = () => {
  if (startNewOrder()) {
    setInputAmount("");
    setIsModalOpen(false);
  }
};
```

`isExecuting` covers preparation, wrapping, approval, signing, and submission.
`isSuccess` becomes true when advanced-order acceptance is confirmed; later fills
are reflected in history. `canDismiss` permits closing the view during execution;
call `startNewOrder()` when closing should also release the form for another order.

Ambiguous submission uses `ExecutionPhase.UNCONFIRMED`. In that phase,
`isUnconfirmed` and `canDismiss` are true and `isExecuting` is false. The captured
account/chain, prepared payload, and available order ID remain in execution state.
Closing this unconfirmed view preserves them. Submission for that visible attempt
stays blocked. An explicit `startNewOrder()` moves it into background recovery and
opens an independent form, even while the original service is unavailable. The
original order may still complete; the new action never resubmits its payload.

`checkOrderStatus()` performs one-shot status reads for the visible unconfirmed
attempt and retained unconfirmed background attempts, without signing or creating
an execution. It reconciles each exact previously prepared payload against the
original account and chain's history. Creation succeeds and its callback runs
once acceptance is confirmed.
Missing/indexing results and network failures remain `UNCONFIRMED`, including
after the signed deadline. Expiry does not prove that the original order was
never accepted or filled.
Recovery excludes legacy sources and requests `rejectInvalidOrders: true`, so
malformed rows cannot be mistaken for a missing order.
`hasUnconfirmedExecutions` also exposes unresolved background attempts, including
ones being checked. Keep a recovery action visible while a new form is open;
call `checkOrderStatus()` and disable it while `isCheckingOrderStatus` is true.

Submission uses one POST with a fixed 30-second timeout covering fetch and body
reads. Pre-abort prevents the POST. Once sent, lifecycle cancellation stops later
work while allowing the response to confirm acceptance. Advanced orders resolve
at that acceptance; swaps retain it without starting cancelled tracking.
Network failures and timeouts can still leave acceptance uncertain. No POST is retried automatically.

`returnToOrderForm()` dismisses a definitive failure or rejection while preserving
the form; it returns `false` during active or unconfirmed execution.
`startNewOrder()` resets Spot's visible form and execution state. It detaches an
active or unconfirmed attempt while retaining its original snapshot. Active work
continues with its captured callbacks and history updates; unconfirmed work stays
available to `checkOrderStatus()`. The user can submit another reviewed order
without waiting. After success, submission stays disabled with `order-completed`
until this explicit reset.
Native wrap requests for the same account and chain run in sequence so a second
order does not reuse an unfinished conversion from the first.
Completed-wrap snapshots match the original input token and raw amount as well
as account, chain, and wrapped token. Returning to the form or applying new form
defaults clears the visible wrap snapshot. Refetch native and wrapped balances
after a confirmed wrap; its receipt does not establish the current spendable balance.
Keep `AdvancedOrdersProvider` mounted; unmounting it aborts its tasks.
`startNewOrder()` returns `false` for a stale callback from an older attempt. The short
delay after a terminal result lets the close animation finish before state resets.

`phase` is the precise execution state: `idle → preparing → wrapping/approving
→ signing → submitting → success`. Wrapping and approval are skipped when
unnecessary. Definitive failures and wallet rejections use `failed` and `rejected`;
uncertain submission uses `unconfirmed`. `status` is the coarser
`ExecutionStatus` value. Map it explicitly to the separately versioned
`@orbs-network/swap-ui` `SwapStatus` enum as shown above. Each attempt has an
internal identity, duplicate starts for the visible attempt are rejected atomically,
and detached progress cannot replace a newer attempt. Host callbacks are observational:
synchronous throws and rejected callback promises never change a wallet or API result.

During visible active or unconfirmed execution, `useOrderForm()` exposes its frozen form.
Failure and rejection recalculate from current inputs for a retry; successful
results retain their form until reset. `useExecution()` retains the attempt's
captured tokens, account, and chain. Preparation runs
after confirmed approval; the resulting payload is retained through signing,
submission, and status reconciliation. Host quote, token, chain, or time updates cannot replace
an unresolved order.

`error` is a `ParsedError`: `code` retains string SDK classifications or numeric
wallet codes, with `0` as the fallback. Optional `reason`, `orderId`, HTTP `status`,
and `serviceCode` preserve settlement and service details for host error UI.

## Callbacks

Host callbacks cover wallet notifications, field synchronization, and balance
refresh. The SDK already reports its analytics; repeating those events in host
callbacks would duplicate them.

```tsx
const callbacks: Callbacks = {
  onWrapRequest: () => {},
  onWrapSuccess: ({ txHash, amount }) => {},
  onApproveRequest: () => {},
  onApproveSuccess: ({ txHash, token, amount }) => {},
  onSignOrderRequest: () => {},
  onSignOrderSuccess: (signature) => {},
  onSignOrderError: (error) => {},
  onOrderCreated: (order) => {},
  onOrderFilled: (order) => {},
  onOrdersProgressUpdate: (orders) => {},
  onSubmitOrderFailed: ({ code, message }) => {},
  onSubmitOrderRejected: () => {},
  onCancelOrderRequest: (order) => {},
  onCancelOrderSuccess: ({ order, txHash }) => {},
  onCancelOrderFailed: (error) => {},
  onCopy: () => {},
  onLimitPriceChange: (price) => {},
  onLimitPricePercentChange: (percent) => {},
  onTriggerPriceChange: (price) => {},
  onTriggerPricePercentChange: (percent) => {},
  onOrderDurationChange: (orderDuration) => {},
  onTradeIntervalChange: (tradeInterval) => {},
  onTradeCountChange: (tradeCount) => {},
};
```

Refetch balances in `onWrapSuccess`, `onOrderCreated`, `onOrderFilled`, `onOrdersProgressUpdate`, and `onCancelOrderSuccess`. Avoid an `onOrderCreated` toast unless the host DEX specifically wants one; the submit modal already shows creation success.
`onSubmitOrderFailed` reports definitive failures, not uncertain submission outcomes
or an intentional wallet-scope dismissal before submission.
Use `isUnconfirmed` / `hasUnconfirmedExecutions` and status recovery for those attempts.

## Cancellation and Order History

Use the exported cancellation hook inside `AdvancedOrdersProvider`:

```tsx
import { OrderStatus, useCancelOrder } from "@orbs-network/spot-react";

function CancelButton({ order }) {
  const { cancelOrder, disabled, isLoading, isSuccess, isError, error, txHash } =
    useCancelOrder(order);

  if (order.status !== OrderStatus.Open) return null;

  return (
    <button onClick={cancelOrder} disabled={disabled || isLoading}>
      {isLoading ? "Cancelling..." : "Cancel"}
    </button>
  );
}
```

Cancellation uses the initialized client for both v1 and v2 orders, keeping request construction on one path; `disabled` remains true while that client is loading or unavailable. History starts after client initialization and uses the configured chain and partner. The `exchange` filter is the exact `Partners` enum value: `Partners.Quick` sends `quick`, with no adapter address appended. When `supportLegacyOrders` is enabled, v1 history is loaded once and retained while v2 history continues polling.

Order history is available directly from `useOrders()`. The query is enabled only while a component using this hook is mounted:

```tsx
const { data: orders, isLoading, isRefetching, refetch } = useOrders();

// orders?.all, orders?.open, orders?.completed, orders?.cancelled, orders?.expired
```

Like `useClient()`, `data` is undefined before the first result. `refetch()`
resolves to the latest categorized orders or `undefined` when no request can be
made. Default the category you render to an empty array, for example
`const allOrders = orders?.all ?? []`.

Provider history filters the connected account. For direct client reads,
`client.getOrders({ account })` filters one wallet; `client.getOrders()` or
`client.getOrders({})` reads across accounts for its configured chain and partner.
The optional options type is `ClientGetOrdersParams`, and the
result remains `{ orders, legacyLoaded }` (`AccountOrdersResult`). The standalone
root `getOrders(filters)` instead returns `Order[]` and uses `swapper` for its
account filter.

Use `useHistoryOrder(order, inputToken?, outputToken?)` for display fields. For large histories, use the virtualization library already present in the DEX for both the orders and fills lists. Store the selected `order.historyKey`, then look up the current order from `orders?.all ?? []` by that key; do not store a stale copy of the order object. The key avoids collisions between numeric v1 IDs from different TWAP contracts; `order.id` remains the protocol ID used for display and cancellation.

Amounts returned by `useHistoryOrder` and its `fills` use `{ raw, ui }`, matching
the form model without fabricating unavailable historical USD values.

`OrderFilter` contains `ALL`, `OPEN`, `COMPLETED`, `CANCELLED`, and `EXPIRED`.
`OrderVariant` identifies a detailed protocol/history variant: swap, limit, TWAP
market/limit, stop-loss market/limit, or take-profit market/limit. Normalized
`Order` and `OrderFill` retain `src`/`dst` and `in`/`out` names because those are
protocol/history response models; form-facing APIs use `input`/`output`.

Render `OrderVariant.SWAP` as “Swap” in history and details. V2 history recognizes
single-trade swaps by their three-minute signed lifetime, zero epoch, positive
minimum output, and absence of triggers; submission timestamps do not affect this
label.

Keep history, details, and modal portals under `AdvancedOrdersProvider` context. Details should include execution summary, order info, fills, explorer/copy actions, and cancellation for open orders.

## Translations

The SDK returns keys rather than final user-facing strings.

Disclaimer keys are:

- `limitOrderDisclaimer`
- `marketOrderDisclaimer`
- `triggerMarketPriceDisclaimer`

Input errors have the shape `{ type, args }`. Resolve `type` through the DEX's i18n system and interpolate `args`, including values such as `maxTrades`, `minTrades`, `minTradeSize`, `duration`, and `fillDelay`. Current duration and fill-delay arguments are human-readable; custom or older integrations should convert raw milliseconds before display.

## React helper APIs

```tsx
import {
  useAmountUi,
  useClient,
} from "@orbs-network/spot-react";

useAmountUi(decimals, rawAmount);
useClient();
```

Submit through `useExecution()`. Internal mutations and execution-store hooks
are deliberately not exported, keeping one supported workflow and one error
contract. `useClient()` must be called under `AdvancedOrdersProvider`; every caller shares
the same partner/chain query, and RePermit configuration is available as
`client?.rePermitData`. Initialization recovery belongs to
`errorFallback`, whose `retry()` refetches configuration for initialization failures.
For calculation/rendering failures, the same `retry()` contract resets the boundary.

Public utilities and constants include:

```tsx
import {
  getOrderExecutionRate,
  getOrderFillDelayMillis,
  getOrderLimitPriceRate,
  calculateOrder,
  invertPriceInput,
  getTriggerPriceRate,
  DISCLAIMER_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_SLTP_FAQ_URL,
  ORBS_LOGO,
  ORBS_WEBSITE_URL,
} from "@orbs-network/spot-react";
```

React integrations can import the entire public Spot SDK API, including
`calculateOrder`, its deprecated `calculateOrderForm` alias, swap helpers, and their types, from `@orbs-network/spot-react`.
It includes `spot-ui` as a runtime dependency; no separate install is needed. Non-React
integrations should import them from `@orbs-network/spot-ui`. Lower-level
calculators remain internal entry points; do not import from `dist/*` or
package-internal source paths.

## Integration Checklist

- Use the DEX's existing tokens, inputs, selectors, components, styling, wallet controls, and routing.
- Keep chain switching out of the Spot token selector; use the DEX network control.
- Keep the form visible while disconnected; replace only the submit area with connect/switch controls.
- Keep Price Protection in advanced forms and UI Slippage in the provider-free swap form.
- Use `@orbs-network/swap-ui` for order creation/progress content.
- Convert raw amounts into the DEX's amount type before display.
- Use callbacks for balance refetch; clear the input after success or after explicitly detaching an active or unconfirmed attempt with `startNewOrder()`.
- Put Spot tabs beside the Swap tab using the DEX's navigation pattern.
- Split production integrations into focused `components`, `hooks`, `context`, and `utils` files.
- Do not add another error boundary around Spot; `AdvancedOrdersProvider` already includes one.

## License

MIT

## Swaps without a provider

Use the public execution-object API from `@orbs-network/spot-react`. The host
keeps its quote/form state, wallet adapter, review modal, and progress UI.
`AdvancedOrdersProvider` remains for advanced-order forms only.

```ts
const execution = client.createSwapExecution({
  quote: reviewedQuote,
  account,
  walletInteractions,
  signal,
});
const order = await execution.run({
  onProgress(update) {
    setProgress(update);
  },
});
```

Construction captures the review and performs no wallet work. `run()` returns
the completed swap `Order`. Optional UI previews are
`await execution.shouldWrap()` and `await execution.shouldApprove()`: both take
zero arguments and only read host decisions, without transactions, preparation,
progress, locks, or execution advancement. Pending checks are fresh; completed
own steps return false. Actual steps recheck, and the conditional sequence in the
[SDK guide](../spot-ui/README.md#run-individual-steps) handles changing decisions. For host-controlled timing, await `wrap()`,
`approve()`, `sign()`, `submit()`, and `waitForCompletion()` on the same session.
Optional wrapping/approval steps skip unnecessary transactions. `sign()` verifies
prerequisites and stores the prepared payload and original wallet signature;
`submit()` takes no arguments, submits that pair once, and returns acceptance.
After each confirmed approval, the SDK rechecks live allowance through
`shouldApprove(request)` against the exact required `amount` and requests one
additional approval if still needed, regardless of the suggested `approvalAmount`.
Approval completes only when the fresh check passes; continued insufficiency
rejects with `INSUFFICIENT_ALLOWANCE` before signing. Allowance read failures and
wallet rejections stop execution; `approvalTxHash` retains the latest confirmed hash.

Readonly `execution.order`, `preparedOrder`, `signature`, `wrapTxHash`, and
`approvalTxHash` become available during execution. Accepted/latest `order` is
updated before its progress callback during `run()`. Pass `onProgress` only in
`execution.run({ onProgress })` through `ExecutionRunOptions<T>`; constructors,
individual steps, and `waitForCompletion()` do not accept observers. It uses the shared
`OrderExecutionUpdate<T>` contract; observer exceptions/rejected promises are
ignored. Handle results and errors around the awaited session method.

`CreateSwapExecutionParams` takes a reviewed quote, account, and wallet callbacks.
`CreateOrderExecutionParams` takes a calculated advanced-order form and protocol
token addresses instead of a quote. `client.createOrderExecution(params).run()`
returns acceptance. Constructors accept only new reviewed input, not saved orders.
The session retains its own accepted/latest `order`; its `waitForCompletion()`
tracks that same submission. For saved accepted state or a stopped session, use
ordinary one-time client status checks:

```ts
const current = await client.getOrder({ orderId: savedOrder.id, signal });
```

The host owns any further polling. If acceptance is unknown and no ID is
available, reconcile the exact original signed identity against configured
account history before creating another execution.

Keep the session at host app/store scope, keep input scope fixed, and guard
duplicate execution through settlement. `cancel()` stops later steps/tracking;
it does not undo transactions or cancel an accepted order. Preserve accepted
snapshots and `OrderSettlementError.orderId`/`order` on uncertain outcomes and
reconcile before starting another signed intent or fallback. No second poller
is required. Swap display quotes may update until `preparedOrder.quote` is
published; freeze that quote and stop obsolete display requests through signing
and submission. Inside swap `sign()`, the SDK reuses reviewed quotes with a local
receipt age of zero to 20 seconds, inclusive, and refreshes older quotes or invalid
or future receipt times for the exact original request. A refreshed minimum must
meet the reviewed floor. Swaps sign a fixed three-minute lifetime with 500 bps
oracle protection. The selected quote
minimum already includes UI slippage; preserve it unchanged.

Replace detached client preparation/signing/submission flows with one session
and its methods. See [the SDK execution migration](../spot-ui/README.md#execution-api-migration),
[typed router example](../spot-ui/examples/router-swap.ts), and
[swap integration guide](../../skills/spot-react-integration/references/07-swap-and-migration.md).

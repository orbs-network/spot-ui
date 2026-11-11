# Spot SDK

`@orbs-network/spot-ui` is a framework-neutral TypeScript SDK for swap quotes,
advanced-order calculation, signing payloads, submission, and order history. It has no React
or wallet-library dependency. React applications can import the same public SDK
from `@orbs-network/spot-react` without installing a separate core package.

```sh
npm install @orbs-network/spot-ui
```

Use a modern browser or Node.js 18+ with `fetch`, `AbortController`, and `BigInt`.
Import from the public package root. The version-matched integration guide ships
at `dist/integration-skill/SKILL.md`, with `manifest.json.sdkVersion` identifying
its package version. The host owns token metadata, wallet operations, balances, USD prices, editable
state, progress, and UI. The SDK owns protocol configuration, order preparation,
submission, and status/history reads.

`Eip712TypedData`, `OrderSigningRequest`, and `ApprovalRequest` are protocol
preparation data and remain core exports for direct DEX integrations.
`WalletInteractions`, `AllowanceRequest`, and `WalletInteractionError` belong to
the optional `@orbs-network/spot-react` host layer. Core integrations use their
existing wallet/read services and handle those services' errors directly.

## API at a glance

| API | Purpose |
| --- | --- |
| `createClient(partner, chainId, options?)` | Load a reusable client with validated protocol configuration |
| `client.getQuote(params)` / `getQuote(params)` | Fetch an exact-input swap quote |
| `calculateOrder(params)` | Derive a calculated advanced-order form |
| `client.spenderAddress` | Read the ERC-20 approval spender for this client |
| `client.prepareSwap(params)` / `client.prepareOrder(params)` | Prepare the exact EIP-712 payload for inline wallet signing |
| `client.submitSwap(order, signature, options?)` | Submit a swap signed by the host and return its acceptance |
| `client.submitOrder(order, signature, options?)` | Submit an advanced order signed by the host and return its acceptance |
| `client.getOrder({ orderId, signal? })` | Read one v2 order once |
| `client.getOrders(options?)` | Read configured history across accounts, or filter by `account` |
| `client.getCancelOrderRequest(order)` | Build the version-specific on-chain cancellation call |
| `getOrders(filters)` | Search order-sink history without initializing a client |

`OrderType` contains only `TWAP`, `LIMIT`, `STOP_LOSS`, and `TAKE_PROFIT`.
`OrderVariant` identifies detailed protocol/history modes, including `SWAP`,
`TWAP_MARKET`, and `TWAP_LIMIT`. Swaps use quotes and token metadata directly;
`calculateOrder` is for the four advanced order types.

## Inline signing with the host wallet

Use the client directly when the host controls wrapping, approval, and signing.
`client.spenderAddress` is the ERC-20 approval spender. Confirm any native wrap
and ensure that allowance covers the exact input amount before preparing the
signing payload; preparation and submission do not run wallet prerequisites.

For a reviewed swap:

```ts
const prepared = await client.prepareSwap({ quote, account, signal });
const { signerAddress, typedData } = prepared.signingRequest;
const signature = await walletClient.signTypedData({
  ...typedData,
  account: signerAddress,
});
const accepted = await client.submitSwap(prepared.order, signature, { signal });
```

For a calculated advanced order, prepare with:

```ts
const prepared = client.prepareOrder({
  form, account, inputTokenAddress, outputTokenAddress,
});
// Sign prepared.signingRequest as above, then submit through client.submitOrder().
```

`PrepareSwapParams` and `PrepareOrderParams` require no `walletInteractions`.
The returned `signingRequest.typedData` contains `domain`, `types`, `primaryType`,
and `message`; `approvalRequest` also exposes the token, spender, exact required
amount, and suggested approval cap. Prepare immediately before signing to obtain
fresh timestamps and a nonce. Swap preparation refreshes stale quotes and rejects
a protected minimum below the reviewed floor.

Sign the supplied data unchanged and submit the same `prepared.order` with the
wallet's original hex signature. Keep the reviewed account and chain current
through signing and submission. Use `submitSwap` for swaps and `submitOrder` for
advanced orders. Both use the same validated submission transport and resolve
at acceptance; read `client.getOrder({ orderId: accepted.id })` to
check fills. The host owns duplicate-submission guards and further status polling.
A failed or timed-out POST can leave acceptance uncertain; reconcile the original
signed order in history before attempting a replacement.
See [the typed inline-signing example](./examples/inline-signing.ts).

## Host-owned wallet flow

The DEX controls the complete wallet sequence:

1. Capture the reviewed quote/form, account, chain, pair, input, and slippage under the host's execution lock.
2. Read ERC-20 allowance for `client.spenderAddress` before opening a wrap prompt. Keep the review action disabled with a loader while the read is pending.
3. Wrap native input when needed and wait for a successful receipt. Protocol orders always use the configured wrapped ERC-20 token address.
4. Request approval only when allowance is below the exact input amount. Confirm its receipt and read allowance again. If a wallet reduced the approval cap, stop or retry according to host policy before signing.
5. Call `prepareSwap()` or `prepareOrder()` after wallet prerequisites finish. Freeze the returned order and final quote for the signature prompt.
6. Sign `prepared.signingRequest.typedData` with `prepared.signingRequest.signerAddress`, then submit the unchanged `prepared.order` and original signature through `client.submitSwap()` for swaps or `client.submitOrder()` for advanced orders.
7. Retain the accepted order and check its status with `getOrder()` until the host's completion policy is satisfied.

`ApprovalRequest.amount` is the exact required input in base units.
`approvalAmount` is a suggested approval cap, defaulting to the maximum uint256;
the host may approve the exact amount or apply its own cap policy. Allowance
only needs to cover `amount`. A confirmed approval hash alone does not prove
that enough allowance was granted. Keep receipt and allowance reads current.

The core SDK accepts no wallet adapter and does not coordinate transaction
prompts, receipt waiting, progress UI, retry policy, or polling. Keep those in
the DEX's existing services. The React advanced-order provider owns its UI
orchestration and uses the same public preparation and submission methods.

Pass request abort signals when the captured wallet/review scope becomes obsolete.
Check that scope before every wallet prompt and before submission. Aborting cannot
undo a confirmed transaction or cancel an order already accepted by the service.
Keep the prepared order, original signature, confirmed hashes, and accepted/latest
order in host state that survives transient modal closure. Guard duplicate attempts
and reconcile uncertain acceptance before signing a replacement or running a fallback.

## Existing DEX routers: use the SDK directly

Keep the DEX route competition, gas policy, wallet, and UI. Quote Spot as one
candidate and compare matching protected minima. Confirm host wrapping and
approval, then prepare the chosen quote with `client.prepareSwap`, sign inline,
and submit with `client.submitSwap`. No React provider or calculated swap form
is needed. See [the typed router adapter](./examples/router-swap.ts).

```ts
const quote = await client.getQuote({
  inToken,
  outToken,
  inAmount,
  user: accountOrPreviewAddress,
  slippage: 0.5,
  dexMinAmountOut, // Optional; undefined becomes "-1" in the API request.
  signal: quoteController.signal,
});
```

Token amounts are integer base-unit strings. Slippage is a percentage: `0.5`
means 0.5%, sent as 50 basis points. `quote.minimumAmountOut` is authoritative;
use it unchanged for comparison, review, and signing. `netAmountOut` is the net
estimated output, and optional input/net/minimum USD totals and price impact are
display metadata. Use the host formatter with the token decimals; never convert
raw spending amounts to JavaScript `Number`.

Quote requests require `user`; disconnected previews can use
`0x0000000000000000000000000000000000000001`. Preparation's `account` supplies
the actual signer and recipient. Exact-output and alternate-recipient routes
remain unsupported; gate them with `isSwapSupported` before wallet work.
Native selections use the configured wrapped ERC-20 protocol address. The
host decides whether wrapping is needed, reads allowance for `client.spenderAddress`,
and confirms any required approval. The host also validates spendable balances,
gas funds, and its minimum-trade policy.

At `prepareSwap()`, after wrapping and approval finish, the SDK reuses the reviewed quote
when its local receipt age is between zero and 20 seconds, inclusive. Older quotes,
invalid receipt times, and future receipt times trigger a refresh for the exact
original request. A refreshed protected minimum below the reviewed floor rejects
with `QUOTE_MINIMUM_DECREASED` and requires fresh review. Otherwise, the selected
quote and its minimum become the prepared order. Hosts may keep
display quotes live through wrapping and approval; freeze the displayed output
and minimum from `prepared.quote` returned by preparation, before the
wallet signature request. Keep the captured account, chain, pair, input amount,
and slippage unchanged. Every swap signs one limit trade, no
trigger, a fixed three-minute lifetime from preparation, and 500 bps signed
oracle protection. Quote-request slippage and signed oracle protection are
separate fields. Local quote age does not guarantee a fill.

`QuoteError` preserves `kind`, HTTP `status`, server `code`, and `retryable`.
Handle an empty offer separately from network or venue errors. `SpotError.code`
classifies SDK-owned failures while wallet, quote, abort, and settlement failures
retain their specific contracts. The [typed swap preview](./examples/swap.ts)
shows quote/token review and the same prepare → sign → submit path.

## Tracking one order

`client.submitSwap()` and `client.submitOrder()` both return an accepted order.
Acceptance does not establish that a swap has filled. Keep the accepted order in
host state and use ordinary status reads:

```ts
const current = await client.getOrder({
  orderId: acceptedOrder.id,
  signal,
});
```

The result may be missing while indexing catches up. The host owns one polling
lifecycle with cancellation, bounded retries, and visibility rules. Show swap
completion only after the order reaches `OrderStatus.Completed`.

A lost submission response can leave acceptance uncertain. Preserve the exact
prepared order, original signature, and any accepted/latest order. If an ID is
known, check it with `getOrder`. Otherwise query configured account history and
match the exact original signed identity before creating any replacement. Stopped
tracking does not establish order failure. Do not automatically repeat a POST,
open another signing prompt, or run a DEX fallback while acceptance is unresolved.
Status/history reads never sign or submit an order.

## Form calculation and units

`calculateOrder` is the single public calculation entry point. It is
synchronous and independent of client configuration and time. Pass editable
values under `userInput`; token decimals, quotes, balances, and USD prices belong
at the top level.

| OrderType | Main inputs |
| --- | --- |
| `OrderType.LIMIT` | Quote and optional `userInput.limitPriceUi`; one limit trade |
| `OrderType.TWAP` | Quote, market/limit mode, optional trade count, interval, and duration |
| `OrderType.STOP_LOSS` | Quote, trigger/limit controls, market/limit mode |
| `OrderType.TAKE_PROFIT` | Quote, trigger/limit controls, market/limit mode |

`quotedOutputAmountRaw` must cover the complete `userInput.inputAmountUi`.
Omit stale quotes while a replacement is loading. Advanced order types derive
minimum output from their price controls. `minTradeSizeUsd` is a positive threshold owned by the host.
Supply the quote's positive `inputAmountUsd` or the input token's positive USD
price for form readiness, and the raw balance for
balance validation. These calculations apply to advanced order types. Swap
previews use the quote directly and the host enforces its balance/minimum-trade policy.

| Model field | Meaning |
| --- | --- |
| `amount.raw` | Token base units as a string, used for protocol/wallet operations |
| `amount.ui` | Decimal token amount for display or editable input |
| `amount.usd` | USD display value; empty when unavailable |
| `form.values` | Authoritative raw values consumed by `client.prepareOrder()` |
| `form.errors.primary` / `form.errors.all` | Primary and ordered validation errors |
| `form.isReady` / `form.canSubmit` | Whether enough inputs exist / validation allows submission |
| `form.notReadyReason` | Missing prerequisite; absent when the form is ready, even if validation prevents submission |

`OrderFormNotReadyReason` is exported for typed integration diagnostics:

| Reason | Next step |
| --- | --- |
| `empty-input` | Provide a positive input amount in the token's precision |
| `awaiting-quote` | Supply a quote for the current amount and token pair |
| `missing-usd-value` | Supply a positive quote `inputAmountUsd` or input-token USD price |
| `missing-token-metadata` | React provider: supply the selected input/output token metadata |

Ready forms can still fail validation. In that case `notReadyReason` is absent;
use `form.errors.primary` and `form.errors.all` to explain `canSubmit: false`.

`form.inputAmount`, `outputAmount`, `minOutputAmountTotal`, `tradePrice`, and
`fees` use structured amounts. `trades` contains per-trade amounts; `schedule`
contains duration, interval, and validation. Price `raw` values are canonical
rates, and their `display` values follow `isPriceInverted`. Use the host's exact
unit conversion with the correct token decimals to convert between display
amounts and integer base-unit strings.

Percentages use percentage units (`3` means 3%); `slippageBps` uses basis points
(`300` means 3%). Time durations use `{ value, unit: TimeUnit.Minutes }` or the
other exported `TimeUnit` values. Normalized duration fields ending in `Millis`
are milliseconds.
`priceProtectionPercent` must be finite and between 0 and 50 inclusive. Invalid
configuration or signed basis points are rejected before wallet steps. A custom
TWAP duration must cover its scheduled trades; an undersized duration produces
the existing minimum-duration error instead of signing trades that cannot finish.

`displayFeePercent` calculates a display estimate only. It does not collect or
subtract a fee. Protocol fee configuration belongs to the partner/backend.

## Preparing, signing, and cancellation

Call `client.prepareOrder()` or `client.prepareSwap()` after wrapping and approval
are confirmed. Their results contain the reviewed form or quote, raw values,
signing request, and approval request. Sign the returned typed data unchanged,
then pass the same protocol order and original signature to `client.submitSwap()`
for swaps or `client.submitOrder()` for advanced orders.
Preparation creates fresh timestamps and a nonce immediately before signing.

For on-chain cancellation, call `client.getCancelOrderRequest(order)`. Send the
returned `contractAddress`, `abi`, and `args` through the host wallet on
`client.chainId`, wait for confirmation, and refresh history. The client handles
v1/v2 contract differences; the host supplies explorer metadata.

## Configured history and identity

Use `client.getOrders({ account })` for one wallet's history. Omit the account
filter with `client.getOrders()` or `client.getOrders({})` to fetch orders across
accounts for the client's configured chain and partner. Its optional
options use `ClientGetOrdersParams`. The host tracks swap settlement through
`client.getOrder()` reads. Configured history returns
an `AccountOrdersResult`; destructure its orders for the list:

```ts
const { orders, legacyLoaded } = await client.getOrders({ account });
const { orders: allOrders } = await client.getOrders();
```

Keep these polling lifecycles
separate. Use `order.historyKey` for list/cache identity: legacy numeric IDs can
repeat across deployments. `order.id` is the protocol/display ID; only v2 IDs
are supported by `getOrder`.

History normalizes v1/v2 orders while retaining protocol names such as
`srcAmount`, `dstAmountFilled`, and fill `inAmount`/`outAmount`. These are raw
integer strings. Format them with the relevant token's decimals. `OrderFilter`
provides `All`, `Open`, `Completed`, `Cancelled`, and `Expired`.

Configured history queries both order-sink v2 and the older order-sink service by
default. The `exchange` filter is the exact `Partners` enum value:
`Partners.Quick` sends `quick`, with no adapter address appended.
`getv1orders: false` limits it to order-sink v2. Separately,
`legacyOrders: false` excludes legacy TWAP subgraph history. Both default to
true. The returned `legacyLoaded` flag is true only when a configured, requested
legacy TWAP source succeeds. It is false when that source is unavailable,
disabled, or failed, and does not describe current-service completeness. Retry a
failed legacy source while retaining successful history; once loaded, it can be
cached separately from current-order polling. Configured-history `page` and
`limit` apply to legacy history; the configured v2 lookup does not forward them.

For standalone order-sink searches, use `getOrders({ chainId, swapper, exchange,
page, limit, signal, getv1orders })`. This root export returns `Order[]`, unlike
the configured client's `{ orders, legacyLoaded }` result. Omitted filters include all values.
`exchange` accepts a `Partners` value. Its `page` is zero-based, `limit` is a
positive integer, and pagination is forwarded to each selected service. Merged
results can exceed one service's limit. Standalone searches do not query legacy
TWAP subgraphs.

## Client configuration and analytics

Page URL parameters do not select the backend. Pass
`{ apiUrl: "https://order-sink-dev.orbs.network" }` to `createClient` to select a
trusted alternative explicitly. Configuration, quotes, submission, and lookups
use that client's captured endpoint; custom services exclude production history.

`createClient` loads validated `/config` data using the shared bounded cache. It rejects chain
mismatches and malformed or zero RePermit and exchange-adapter addresses. The
client supplies configured spender, exchange, signing data, and cancellation
requests. The host supplies wrapped native tokens and other chain metadata;
the SDK has no network registry. Cache clients/promises in the host data layer
and allow rejected initialization attempts to be retried.

Analytics is enabled by default. Validated configuration supplies contract
metadata; configuration failures still report the requested partner/chain.
The core SDK reports configuration, quotes, order preparation, and submission.
The React host integration additionally reports its wallet lifecycle, settlement,
cancellation, and status reconciliation. Direct DEX integrations own wallet and
tracking telemetry. Host callbacks do not need to repeat events already reported
by the integration layer they use.

Each lifecycle step creates a separate event record with a unique `_id`.
`operationId` links the events for one execution, cancellation, or quote request.
Request and preparation events carry the trade details; later events carry their
own result, transaction hash, or error. Contract configuration is recorded on
`configuration.loaded`, without repeating it on every wallet step. Common context
includes partner, chain, account, SDK/UI versions, and browser origin when available.
Wallet signatures and complete signed payloads are never included.
Each event has an explicit field list. Single-trade orders omit chunk counts,
per-chunk amounts, and fill delays; trigger settings appear only for triggered
orders. Multi-trade `fillDelay` matches the signed interval in milliseconds.
Every emitted value is a string, finite number, or boolean. Objects, arrays,
null, and invalid numbers are omitted. Batch cancellation steps emit one record
per order, using scalar `cancelOrderId` and `cancelOrderVersion` fields under the
same `operationId`.

| Event | Additional data |
| --- | --- |
| Configuration loaded | Contract addresses and signing configuration actually used |
| Quote requested or reused | Original quote user, pair, input amount, and slippage |
| Execution requested or order prepared | Applicable trade amounts and order settings |
| Approval requested | Token, spender, `approvalRequiredAmountRaw` (exact input), and `approvalAmountRaw` (suggested cap, not the host/wallet's actual choice) |
| Wallet transaction confirmed | That step's transaction hash |
| Submission or cancellation outcome | Relevant order IDs and transaction hash or error |
| Swap settlement | Order ID and applicable fill/progress information |
| Failure | Redacted message and available SDK/HTTP/service error codes |

`sessionId` connects operations within the current page load. It is kept only in
memory and changes on refresh. Clients and operations on the same page share it,
including across wallet, chain, or partner changes. Server-side events omit it;
browser storage is never used.
`eventName` identifies the step and outcome, such as `quote.requested`,
`signing.succeeded`, or `submission.failed`. Duplicate action, phase, and success
flags are not emitted. Generic
failures retain `errorPhase` to identify the failing step.
`eventTimestampMillis` records when it happened, before
delivery delays; `eventSequence` orders events within one operation. Events are
not debounced, so rapid request/success transitions remain separate records.

Count `submission.succeeded` for accepted submissions and `settlement.filled`
for completed swaps. These are separate events; no additional success/status
booleans are needed.
The React host integration reports settlement while it tracks swaps. Direct
hosts use `client.getOrder({ orderId, signal })` or configured history to check
status and retain their own accepted/latest order without signing or submitting again.

To disable analytics for a client:

```ts
const client = await createClient(Partners.Thena, 56, { disableAnalytics: true });
```

Use `disableAnalytics` when creating a client to apply the host's telemetry
preference to its quotes, preparation, and submission. The policy belongs to
`createClient` only; preparation inputs and standalone
`getQuote` take no reporting override. Use `client.getQuote` when quote reporting
must follow that policy. Passing `disableAnalytics` on a quote request rejects
with `QuoteError` (`invalid-request`) before any analytics or quote HTTP request.
Status/history reads use the configured client; saved
order metadata does not supply a reporting override. React's provider `disableAnalytics` prop maps to
the option when creating its client. Reporting and operation association are
handled internally.

Delivery is best effort: HTTP failures and timeouts are contained and never
change trading results. Initialization also works without `window`.

## Execution API migration

The core SDK has one execution path: the host confirms wrapping/approval, calls
`prepareSwap()` or `prepareOrder()`, signs the returned EIP-712 data, and calls
`submitSwap()` or `submitOrder()` respectively with that unchanged order and
original signature.

| Former client API | Replacement |
| --- | --- |
| `createOrderExecution()` / `createSwapExecution()` and wallet-adapter/session contracts | Host-owned wallet sequence, then public preparation/signing/submission |
| `executeSwap(params)` | `prepareSwap()` → host signature → `submitSwap()` |
| Calculated-form `executeOrder(params)` | `prepareOrder()` → host signature → `submitOrder()` |
| `submitSignedSwap` | `submitSwap(prepared.order, signature, options?)` |
| `submitSignedOrder` | `submitOrder(prepared.order, signature, options?)` |
| Accepted-order tracking methods | Ordinary `client.getOrder` or configured history reads with host-owned polling |

`submitSwap()` and `submitOrder()` both resolve at acceptance. Move receipt waiting,
allowance verification, progress, duplicate guards, retries, and fill polling into
the host. Public preparation and submission take no wallet callbacks. The React
advanced-order provider can still coordinate its own form UI using those methods.

### Wallet type and error migration

Import `AllowanceRequest` from `@orbs-network/spot-react` when implementing a
React provider adapter; it contains only `tokenAddress` and `spenderAddress`.
`GetAllowanceProps` remains a React alias for the same shape. The core package
continues to export `Eip712TypedData`, `OrderSigningRequest`, and `ApprovalRequest`
because public preparation returns those protocol payloads. Its `Signature` type
also remains part of protocol order-history data; inline submission still takes
the wallet's original hex signature.

React-generated `WRAP_FAILED`, `APPROVAL_FAILED`, and `INSUFFICIENT_ALLOWANCE`
failures now use `WalletInteractionError` and `WalletInteractionErrorCode` from
`@orbs-network/spot-react`, preserving their existing code strings. They are no
longer members of the core `SpotErrorCode` union. Core `SpotError` continues to
classify preparation, protocol, submission, and lookup failures. Remove the unused
`EXECUTION_IN_PROGRESS` classification from host error maps and keep duplicate
execution guards in host state.

### Order naming migration

Replace the former `Module` enum with the four-value `OrderType` and rename
calculator input, form field, and React provider prop from `module` to
`orderType`. The former detailed `OrderType` enum is now `OrderVariant`;
`form.values.orderVariant` holds that mode, and history retains
`Order.type: OrderVariant`. React uses `OrderType` directly rather than
`AdvancedOrderModule`. There is no high-level `SWAP`; swap previews read quotes
and token metadata directly. Removed swap-only calculator minimum/output USD
fields belong to the quote preview instead.

## Migrating from Liquidity Hub

`@orbs-network/liquidity-hub-sdk` is deprecated. Its Permit2 spender, payload,
signature, and transaction-hash result cannot be reused for Spot. Install this
SDK, fetch a Spot quote, confirm host wrapping/approval, prepare the swap, sign
inline, and submit the exact signed order. Read its accepted ID from
`client.submitSwap()` and track `getOrder()` until completed before showing a
swap as filled. Preserve route comparison, balance/gas policy, and UI. React
hosts can import the same public client API from `@orbs-network/spot-react`.

## Migrating from 1.x

Use the current headless form hooks in `spot-react`, or calculate advanced forms
in the host state layer. Keep editable inputs and token/market services in the
host, and use public preparation, inline signing, and submission after host wallet prerequisites.
Inspect installed public declarations and matching versioned integration docs
before adapting an older integration.

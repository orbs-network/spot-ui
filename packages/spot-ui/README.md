# Spot SDK

`@orbs-network/spot-ui` is a framework-neutral TypeScript SDK for swap quotes,
advanced-order calculation, wallet execution, and order history. It has no React
or wallet-library dependency. React applications can import the same public SDK
from `@orbs-network/spot-react` without installing a separate core package.

```sh
npm install @orbs-network/spot-ui
```

Use a modern browser or Node.js 18+ with `fetch`, `AbortController`, and `BigInt`.
Import from the public package root. The version-matched integration guide ships
at `dist/integration-skill/SKILL.md`, with `manifest.json.sdkVersion` identifying
its package version. The host owns token metadata, wallet adapters, balances,
USD prices, editable state, and UI; the SDK owns protocol configuration and execution.

## API at a glance

| API | Purpose |
| --- | --- |
| `createClient(partner, chainId, options?)` | Load a reusable client with validated protocol configuration |
| `client.getQuote(params)` / `getQuote(params)` | Fetch an exact-input swap quote |
| `calculateOrder(params)` | Derive a calculated advanced-order form |
| `client.createSwapExecution(params)` | Capture a reviewed quote in a swap execution session |
| `client.createOrderExecution(params)` | Capture a calculated advanced-order form in an order execution session |
| `client.getOrder({ orderId, signal? })` | Read one v2 order once |
| `client.getOrders(options?)` | Read configured history across accounts, or filter by `account` |
| `client.getCancelOrderRequest(order)` | Build the version-specific on-chain cancellation call |
| `getOrders(filters)` | Search order-sink history without initializing a client |

`OrderType` contains only `TWAP`, `LIMIT`, `STOP_LOSS`, and `TAKE_PROFIT`.
`OrderVariant` identifies detailed protocol/history modes, including `SWAP`,
`TWAP_MARKET`, and `TWAP_LIMIT`. Swaps use quotes and token metadata directly;
`calculateOrder` is for the four advanced order types.

## Client wallet orchestration

Create a session after reviewing the quote. The constructor snapshots that
review and performs no wallet work. Validation is synchronous and can throw
before a session is returned:

```ts
const execution = client.createSwapExecution({
  quote,
  account,
  walletInteractions,
  signal,
});
const order = await execution.run({
  onProgress(update) {
    setProgress(update);
  },
});
// order is completed; execution.order contains the accepted/latest snapshot.
```

For a calculated advanced order:

```ts
const execution = client.createOrderExecution({
  form,
  account,
  inputTokenAddress,
  outputTokenAddress,
  walletInteractions,
  signal,
});
const order = await execution.run({
  onProgress(update) {
    setProgress(update);
  },
});
// order is accepted; later fills are available through history.
```

`CreateSwapExecutionParams` takes the quote and connected account.
`CreateOrderExecutionParams` takes the reviewed form, account, and protocol token
addresses. Both use the host's `OrderWalletInteractions` and optional `signal`.
Pass progress observers only to `run({ onProgress })`, through
`ExecutionRunOptions<T>`. Swap sessions have type `SwapExecution`; advanced sessions
have type `OrderExecution<PreparedOrder>`.

`run()` uses the same session engine as the individual methods below. For swaps
it resolves with the completed `Order`; for advanced orders it resolves at
acceptance. There is no additional completed-swap wrapper.

### Preview wallet requirements

```ts
const wrapRequired = await execution.shouldWrap();
const approvalRequired = await execution.shouldApprove();
renderStepPreview({ wrapRequired, approvalRequired });
```

Both execution methods take zero arguments and return `Promise<boolean>`.
They call the host's decision callbacks; the SDK supplies the captured
`ApprovalRequest` to wallet `shouldApprove(request)`. These checks perform no
transactions, preparation, progress notifications, execution start, or account
locking. Pending checks read fresh host decisions; a step already completed or
skipped by this execution returns false, as do checks after signing or acceptance.
Actual steps recheck decisions; UI preview results do not commit the step.

### Run individual steps

```ts
if (await execution.shouldWrap()) await execution.wrap();
if (await execution.shouldApprove()) await execution.approve();
await execution.sign();
const accepted = await execution.submit();
const completed = await execution.waitForCompletion();
```

| Method | Behavior |
| --- | --- |
| `shouldWrap()` | Read-only preview of the pending wrapping requirement; no arguments |
| `shouldApprove()` | Read-only preview of the pending approval requirement; no arguments |
| `wrap()` | Uses wallet `shouldWrap()`; false skips the write, true confirms the native wrapping transaction |
| `approve()` | Uses wallet `shouldApprove(request)`; false skips the write, true confirms approval and rechecks allowance, retrying once if needed |
| `sign()` | Verifies prerequisites, prepares fresh timestamps/nonce, and stores the exact payload and original wallet signature |
| `submit()` | Submits the stored payload/signature once and returns the accepted `Order` |
| `waitForCompletion()` | Tracks the accepted order until completion |
| `run()` | Runs the full sequence; swaps include completion tracking, advanced orders finish at acceptance |
| `cancel(reason?)` | Stops later steps or tracking; it cannot undo transactions or cancel an accepted order |

Cancellation before submission prevents its POST. Once sent, the request keeps
its existing 30-second timeout so a late acceptance can be retained. Advanced
orders resolve at acceptance; cancelled swaps retain the order without continuing
settlement tracking. A lost response still requires status reconciliation.
When proving absence from current history, use `client.getOrders` with
`legacyOrders: false`, `getv1orders: false`, and `rejectInvalidOrders: true`.
This prevents malformed rows or a legacy-only partial result from looking like
an empty current-service history. Ordinary history reads remain tolerant.

You can also call `wrap()` and `approve()` unconditionally; false wallet decisions
skip their writes. If a prerequisite method was omitted, `approve()`/`sign()`
checks it again and records a skip only when the fresh decision is false. A true
decision rejects with a sequence error so the host can run the required step;
it never opens an earlier wallet prompt automatically. `sign()` prepares fresh
data after prerequisites are satisfied.
Each transaction step returns a cached `TransactionStepResult`: `{ status: "skipped" }` or
`{ status: "success", txHash }`; simultaneous calls share the same promise.
The host implements decision callbacks on `walletInteractions`; the execution's
zero-argument preview methods use those callbacks with the captured request.
When a decision is true, its transaction callback must return `Promise<Hex>`
after a successful receipt; returning undefined is not a skip mechanism.

`ApprovalRequest` carries `tokenAddress`, `spenderAddress`, and two raw integer strings:

| Field | Meaning |
| --- | --- |
| `amount` | Exact input required for the reviewed swap or order; compare allowance against this value |
| `approvalAmount` | Suggested cap for the approval write; defaults to the maximum uint256 (`2^256 - 1`) |

For example, `shouldApprove({ amount, ... })` compares live allowance to `amount`,
while `approveToken({ approvalAmount, ... })` can pass `approvalAmount` to the
host's ERC-20 approval helper. A host may instead approve `amount` exactly or
apply its own cap policy. Build the host transaction from those values without
mutating the SDK's immutable request. A cap below the required `amount` cannot
satisfy the approval check; allowance does not need to reach `approvalAmount`.

After each confirmed approval, the SDK calls `shouldApprove(request)` again with
the same captured token, spender, and exact required `amount`. If allowance remains insufficient,
it requests one more approval and verifies again. Continued insufficiency rejects
with `INSUFFICIENT_ALLOWANCE` before signing. Read failures or wallet rejections
stop execution. Keep allowance reads current; a confirmed hash alone does not
complete the approval step. Retries remain one progress step, and
`approvalTxHash` retains the latest confirmed transaction.

The session exposes readonly `order`, `preparedOrder`, `signature`,
`wrapTxHash`, and `approvalTxHash` as they become available. `submit()` takes no
payload or signature arguments; the session retains their exact pairing. Return
the wallet's original `0x`-prefixed signature from `signOrder`, without splitting
`{ v, r, s }`, rewriting its recovery byte, or normalizing its representation.

The host owns wallet/review scope checks. Pass an `AbortSignal` and abort it when
the captured account, chain, or review becomes obsolete; wallet callbacks also
check that scope before opening prompts. Retry decisions and wrapped-balance
checks belong to the host's wallet adapter. The execution retains its own
confirmed `wrapTxHash`; a new attempt does not inherit wrapping through a
constructor option. Keep the session
at an app/store scope that survives transient modal unmounts, and prevent
accidental duplicate submissions of the same reviewed intent. Swap display
quotes may remain live until the final `preparedOrder.quote` is published;
freeze that quote and stop obsolete display requests before wallet signing.
Independent sessions may run concurrently for the same account and client. Each
session deduplicates repeated `run()` and step calls within that session; the host
decides when a user is starting a separate order.

### Progress and accepted state

`run({ onProgress })` receives the existing `OrderExecutionUpdate<T>` contract: `phase`,
`event`, `steps`, `stepIndex`, `hasApproval`, and available `wrapAmountRaw`,
`wrapTxHash`, `approvalTxHash`, `preparedOrder`, `signature`, `order`, and `error`.
`T` is `PreparedSwap` for swaps and `PreparedOrder` for advanced orders.
Before the first wallet phase, `preparing` updates keep `steps: []` through the
initial prerequisite reads and fresh rechecks. Show preparation without a
numbered count. When wrapping is required, `run()` checks allowance before opening
the wrap wallet prompt and reuses that decision for the first approval action.
It checks allowance again after every confirmed approval receipt. The required
plan is revealed on the first actual `wrapping`, `approving`, or `signing` request.
Later requirement checks can still update a revealed plan. A `preparing`/`skipped`
event removes an unnecessary step; only confirmed
transactions emit success with a hash. Intermediate `success` events
complete individual phases; final success is `settling`/`success` for a filled
swap and `submitting`/`success` for an accepted advanced order. During `run()`,
failures emit an `error` event and reject its promise. Individual methods reject
their own promises when driven directly.

The session updates its accepted/latest `order` before publishing the
corresponding progress event during `run()`. Individual step methods and
`waitForCompletion()` accept no observer; inspect the session getters when
driving those methods directly. Observer exceptions and rejected promises are
ignored; observers cannot interrupt the engine. Keep result/error handling around
the awaited session method.

## Existing DEX routers: use the SDK directly

Keep the DEX route competition, gas policy, wallet, and UI. Quote Spot as one
candidate, compare matching protected minima, then capture the chosen quote in
`createSwapExecution`. Supply the DEX's wallet callbacks and choose `run()` or
control each step on that same session. No React provider or calculated swap form
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
`0x0000000000000000000000000000000000000001`. The constructor's `account` supplies
the actual signer and recipient. Exact-output and alternate-recipient routes
remain unsupported; gate them with `isSwapSupported` before wallet work.
Native selections use the configured wrapped ERC-20 protocol address. The
host's required `shouldWrap()` callback decides whether wrapping is needed.
Required `shouldApprove(request)` compares live allowance with the exact required
`request.amount`, independently of the suggested `request.approvalAmount` cap.
Both support asynchronous boolean decisions. False skips
the write; true invokes the corresponding hash-returning transaction callback.
The SDK has no `getAllowance` wallet callback. The host validates
spendable balances, gas funds, and its minimum-trade policy.

At `sign()`, after wrapping and approval finish, a swap reuses its reviewed quote
when its local receipt age is between zero and 20 seconds, inclusive. Older quotes,
invalid receipt times, and future receipt times trigger a refresh for the exact
original request. A refreshed protected minimum below the reviewed floor rejects
with `QUOTE_MINIMUM_DECREASED` and requires fresh review. Otherwise, the selected
quote and its minimum become the prepared order. Hosts may keep
display quotes live through wrapping and approval; freeze the displayed output
and minimum from `preparedOrder.quote` when the SDK publishes it, before the
wallet signature request. Keep the captured account, chain, pair, input amount,
and slippage unchanged. Every swap signs one limit trade, no
trigger, a fixed three-minute lifetime from preparation, and 500 bps signed
oracle protection. Quote-request slippage and signed oracle protection are
separate fields. Local quote age does not guarantee a fill.

`QuoteError` preserves `kind`, HTTP `status`, server `code`, and `retryable`.
Handle an empty offer separately from network or venue errors. `SpotError.code`
classifies SDK-owned failures while wallet, quote, abort, and settlement failures
retain their specific contracts. The [typed swap preview](./examples/swap.ts)
shows quote/token review and the same session API.

## Tracking one order

The execution retains its own accepted/latest `order`. After its own `submit()`,
call `waitForCompletion()` to track that submission, or use swap `run()` to include
completion tracking. Constructors accept only a new reviewed quote or calculated
form; they do not accept saved orders.

For an ordinary one-time status check:

```ts
const current = await client.getOrder({
  orderId: acceptedOrder.id,
  signal,
});
```

The result may be missing while indexing catches up. If the host needs continued
status updates after a session stops, own the polling lifecycle around `getOrder`
with cancellation, bounded retries, and visibility rules. Do not add a second
poller while a session is already tracking.

`submit()` returns acceptance, not a swap fill. A lost submission response can
leave acceptance uncertain. Preserve the session's accepted/latest order,
prepared payload, and original signature, plus `OrderSettlementError.orderId` and
optional `order` when available. If an ID is known, check it with `getOrder`.
Otherwise query configured account history and match the exact original signed
identity before creating any replacement. Stopped tracking does not establish
order failure. Never automatically repeat a POST, open another signing prompt,
or run a DEX fallback while acceptance is unresolved.

`cancel()` stops later steps or tracking rather than invoking on-chain cancellation.
Status/history reads do not recreate an execution or submit anything.

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
| `form.values` | Authoritative raw execution values consumed by `execution.sign()` |
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

Preparation belongs to `execution.sign()`, after wrapping and approval are
confirmed. Inspect `execution.preparedOrder` for its reviewed form or quote,
raw values, signing request, and approval request. `execution.submit()` uses
that exact prepared order and the stored original signature; callers do not
prepare or submit a different payload through the client.

For on-chain cancellation, call `client.getCancelOrderRequest(order)`. Send the
returned `contractAddress`, `abi`, and `args` through the host wallet on
`client.chainId`, wait for confirmation, and refresh history. The client handles
v1/v2 contract differences; the host supplies explorer metadata.

## Configured history and identity

Use `client.getOrders({ account })` for one wallet's history. Omit the account
filter with `client.getOrders()` or `client.getOrders({})` to fetch orders across
accounts for the client's configured chain and partner. Its optional
options use `ClientGetOrdersParams`. Swap settlement is handled by
`execution.run()` or `execution.waitForCompletion()`. Configured history returns
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
The SDK owns telemetry for configuration, quotes, execution, submission, and
tracked swap settlement. Advanced order creation finishes at submission; later
fills remain available in order history. `spot-react` also reports cancellation
and status reconciliation. Host callbacks do not need to repeat these SDK events.

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
Settlement reporting is internal. If tracking stops or fails, use ordinary
`client.getOrder({ orderId, signal })` or configured history to check status. Retain
`OrderSettlementError.order` and `orderId` so the same intent can be checked
without signing or submitting again.

To disable analytics for a client:

```ts
const client = await createClient(Partners.Thena, 56, { disableAnalytics: true });
```

Use `disableAnalytics` when creating a client to apply the host's telemetry
preference to its quotes and execution sessions. The policy belongs to
`createClient` only; execution constructors and standalone
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

Replace the overlapping client execution, preparation, and signed-submission
methods with `createSwapExecution` or `createOrderExecution`. Replace an awaited
swap call with `await client.createSwapExecution(params).run()`. Replace a
calculated advanced-order call with `await client.createOrderExecution(params).run()`.
Both now return an `Order` from `run()`. Read prepared payloads, signatures,
accepted state, and transaction hashes from the execution object.

| Former client API | Replacement |
| --- | --- |
| `executeSwap(params)` | `createSwapExecution(params).run()` |
| Calculated-form `executeOrder(params)` | `createOrderExecution(params).run()` |
| `prepareSwap` / `prepareOrder` | `execution.sign()` prepares late; inspect `execution.preparedOrder` |
| `submitSignedSwap` / `submitSignedOrder` | `execution.submit()` uses the session's stored signed pair |
| Accepted-order `executeOrder({ order })` | Ordinary `client.getOrder` or configured history reads; host-owned polling if needed |

For a host-controlled sequence, create one session and call `wrap()` →
`approve()` → `sign()` → `submit()` → `waitForCompletion()` as needed. Pass wallet
callbacks at construction instead of signing a detached payload. Saved accepted
orders are checked through normal client status/history reads; constructors start
new reviewed executions only.

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
SDK, fetch a Spot quote, adapt the host wallet callbacks, and create a swap
execution. Read its accepted order ID after `submit()` and await `run()` or
`waitForCompletion()` before showing a swap as complete. Preserve the host's
route comparison, balance/gas policy, and UI. React hosts can import the same
session API from `@orbs-network/spot-react`.

## Migrating from 1.x

Use the current headless form hooks in `spot-react`, or calculate advanced forms
in the host state layer. Keep editable inputs and token/market services in the
host, and use the two execution constructors for wallet and order lifecycles.
Inspect installed public declarations and matching versioned integration docs
before adapting an older integration.

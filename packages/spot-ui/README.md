# Spot SDK

`@orbs-network/spot-ui` quotes swaps, calculates order forms, and prepares and
submits Spot orders. It supports Swap, TWAP, Limit, Stop-Loss, and Take-Profit.
It works with any TypeScript application and has no React or wallet-library
dependency. Despite its name, `spot-ui` is a framework-neutral SDK with no rendered components.
React applications can use `@orbs-network/spot-react` for provider
state, wallet-step orchestration, and settlement tracking. It includes this SDK
as a dependency and re-exports its full public API, so those applications can
install only `spot-react` and import SDK helpers and types from it.

For AI-assisted integration, give your agent the requested features and access to
the host project. The matching guide is included at
`node_modules/@orbs-network/spot-ui/dist/integration-skill/SKILL.md`; its adjacent
`manifest.json` records `sdkVersion`. The agent should inspect the existing app,
choose a focused integration path, and ask only unresolved product questions.
For a new or non-DEX app, the guide includes a starting path for wallet setup,
token lists, balances, quote/USD data, and the missing trading UI.
The [source guide](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-integration)
is useful when working in this repository; installed exports and the bundled
guide take precedence for an already installed SDK.

| I'm building… | Use… |
| --- | --- |
| A React order form | `spot-react`: `SpotProvider` with `Module.SWAP` or an advanced module, then `useExecution()` |
| SDK wallet orchestration | `client.executeSwap` for quotes; `calculateOrder` + `client.executeOrder` for calculated forms |
| A DEX router that controls wallet steps | `client.getQuote` → `client.prepareSwap` → DEX signing → `client.submitSignedSwap`; submission waits for the fill |

```sh
npm install @orbs-network/spot-ui
```

Use a runtime with `fetch`, `AbortController`, and `BigInt` support, such as a
modern browser or Node.js 18+. Import from the package root.

## API at a glance

| API | Purpose | Network or wallet work |
| --- | --- | --- |
| `createClient(partner, chainId)` | Create a client with validated configuration for one partner and chain | Shares bounded `/config` requests/templates; no wallet interaction |
| `client.getQuote(params)` | Quote using the client's partner and chain | Same quote request and result as `getQuote` |
| `getQuote(params)` | Quote the full input amount for a swap | Fetches `/quote` directly from order-sink v2 |
| `client.executeSwap({ quote, account, walletInteractions, ...options })` | Execute a reviewed quote through the host wallet and wait for its fill | Returns a completed swap intent |
| `client.executeOrder({ form, account, inputTokenAddress, outputTokenAddress, walletInteractions, signal? })` | Execute a calculated form with internal late preparation | Swaps resolve after a fill; advanced orders resolve at acceptance |
| `client.prepareSwap({ quote, account, signal?, maxQuoteAgeMillis? })` | Advanced: refresh/check the quote and prepare its unsigned swap | Zero or one quote request; no wallet work |
| `client.submitSignedSwap(prepared, signature, { signal }?)` | Advanced: submit an already signed `PreparedSwap` and wait for its fill | One POST followed by bounded internal polling |
| `isSwapSupported(params)` | Gate unsupported exact-output/custom-recipient requests | Synchronous |
| `calculateOrder(params)` | Calculate display values, validation, and execution amounts | Synchronous; no requests |
| `client.prepareOrder(params)` | Build a fresh order and its signing/approval requests from a valid form | No requests; stamps timestamps and nonce |
| `client.submitSignedOrder(order, signature, { signal }?)` | Submit an already signed order | Swaps resolve after a fill; advanced orders resolve at acceptance |
| `client.executeOrder({ order, signal? })` | Resume a saved order without wallet work or another submission | Swaps resume bounded settlement polling; advanced orders return their snapshot |
| `client.getOrder({ orderId, signal })` | Look up one v2 order by its full ID | One hash-filtered request; no automatic polling |
| `client.getAccountOrders({ account, ... })` | Load account history on the client's partner and chain | Returns `{ orders, legacyLoaded }` from configured history sources |
| `client.getCancelOrderRequest(order)` | Build the cancellation contract call | Host sends and confirms the transaction |
| `getOrders(filters)` | Search history without initializing a client | Filters can span accounts, chains, and exchanges |

The SDK owns protocol configuration and order calculations. The host owns token
metadata, wrapped native tokens, balances, USD prices, form state, wallet
operations, client caching, and polling lifecycles. Client execution and signed
submission include bounded swap settlement tracking. Keep one current form model
for both review and signing.

`calculateOrderForm` remains available as a deprecated alias of `calculateOrder`
for existing integrations.

`createClient` returns a new client. Validated configuration templates share
in-flight requests and a 60-second, 32-entry LRU cache keyed by API endpoint/partner/chain;
each caller receives a deep copy, and failed requests are evicted. Nonces are
allocated across clients within the loaded SDK instance. The host still owns
client resource lifetime and invalidation.

Clients use the production v2 service regardless of page URL parameters. To use
a trusted alternative, pass `{ apiUrl: "https://order-sink-dev.orbs.network" }`
to `createClient`. The endpoint stays fixed for that client's lifetime. Pass
`apiUrl: client.apiUrl` to standalone history calls for that service.

## Client wallet orchestration

Use `client.executeSwap` as the default flow for a reviewed quote:

```ts
const completed = await client.executeSwap({
  quote,
  account,
  walletInteractions,
  signal,
});
// completed.order is filled; completed.status is "completed".
```

For a reviewed calculated form, use `client.executeOrder`:

```ts
const result = await client.executeOrder({
  form,
  account,
  inputTokenAddress,
  outputTokenAddress,
  walletInteractions,
  signal,
});
```

Its `ExecuteOrderParams` options take the form, account, token addresses, and
wallet adapter, with optional `signal`. Execution prepares from
the reviewed form's amounts and protected minimum. It does not accept a quote or
refresh quote age; use `client.executeSwap({ quote, ... })` for the quote-aware
flow. Swap execution resolves after a confirmed fill. Limit, TWAP, and other
advanced orders resolve when the service accepts them, since their fills may take
much longer.

The result includes `order`, `preparedOrder`, and optional
`approvalTxHash`. `signal` stops later wallet steps or settlement
tracking without cancelling an accepted order. Retain `OrderSettlementError.order`
and `orderId` when settlement becomes uncertain. React's provider keeps wallet
progress, accepted snapshots, and live-context checks in its internal execution
path; use its execution hooks for progress UI.

The client supplies its partner, chain, endpoint, and shared account execution
lock. Both execution methods use the same internal wallet runner and settlement
poller. The required `walletInteractions.shouldWrap()` callback is called
once before allowance reads or writes and may return a boolean or promise. True
requests confirmed wrapping through `wrapNativeToken`; false skips it. Errors,
missing callbacks, and non-boolean results stop execution. Allowance is verified
with bounded retries, and signing follows fresh preparation. Protocol input
addresses and quotes must use the actual wrapped ERC-20 token for native input.
React handles that normalization using the host's `wrappedNativeToken` metadata.
The host still owns balance/minimum-trade policy and keeps uncertain submissions
locked until they are reconciled.

All swaps expire three minutes after final preparation, immediately before
signing. `client.executeSwap` uses `prepareSwap` at that point with its default
20-second quote reuse window. A lower refreshed `minimumAmountOut` rejects with
`QUOTE_MINIMUM_DECREASED`; an equal or higher minimum preserves the original
reviewed quote and signed minimum. React's provider uses the same quote-aware
helper for its calculated swap forms; public form-only `executeOrder` signs the
form's reviewed minimum directly.
Pause host quote updates while the reviewed attempt is executing.

`client.executeSwap` returns a `CompletedSwap`:
`{ type: "intent", status: "completed", orderId, order, deadlineMillis,
wrapTxHash?, approvalTxHash? }`. Its order is filled. `deadlineMillis` equals the
protocol-rounded `order.deadline` in Unix milliseconds. `type: "intent"` lets
routers distinguish signed-order execution from transaction-hash routes. Keep
confirmed wallet transaction hashes in host state; the SDK does not invent one
for an intent.

`client.submitSignedSwap` submits an already signed prepared swap and waits for
its fill, returning the completed `Order`. `client.submitSignedOrder` also waits
for swaps, while returning accepted advanced orders. All four client methods use
one settlement flow; there is no public polling helper or second React poller.

The internal poller reads the submitted order serially, normally every two
seconds, bounded by `order.deadline` plus 60 seconds for indexing. Missing
snapshots or request failures back off at 2, 4, 8, 16, then 30 seconds; a matching
snapshot resets the delay. `OrderSettlementError.reason` is `cancelled`, `expired`,
`aborted`, or `unconfirmed`. Its `orderId` and optional `order` retain the accepted
or latest snapshot for recovery. Aborted/unconfirmed tracking does not prove the
order failed; never submit a replacement or DEX fallback automatically.

Resume a saved order through the same client without signing or submitting again:

```ts
const completed = await client.executeOrder({
  order: savedOrder,
  signal,
});
```

This overload performs only read-only status tracking for swaps and returns an
advanced order snapshot directly. Keep the client and accepted order at app/store
scope when settlement must outlive closing a modal.
If the original deadline-plus-60-second tracking window has already passed,
recovery allows a fresh lookup window of up to 30 seconds. It does not change the
signed order deadline. React sends a saved accepted order directly to this
overload; only unknown acceptance requires history discovery first.

Capabilities currently declare exact input and signer-as-recipient only. Gate
exact-output or alternate-recipient trades with `isSwapSupported` before wallet
work. Swap preparation and execution derive the pair, raw input, and protected
minimum from the reviewed quote; `account` supplies signer and recipient.

## Existing DEX routers: use the SDK directly

A DEX can add Spot as one candidate in its existing quote competition without a
`SpotProvider`. Keep the DEX's form, route selector, approval UI, wallet library,
and modal. Compare like-for-like protected minima for the same raw input, token
pair, chain, and account, retaining the DEX's gas/fee ranking policy.

For existing DEX wallet flows, prefer `client.prepareSwap` → DEX signing →
`client.submitSignedSwap`. No `walletInteractions` object is required.

```ts
// React hosts can import the same APIs from @orbs-network/spot-react instead.

// The DEX completes native wrapping if needed, then confirms ERC-20 approval
// for quote.request.inToken/inAmount to client.spenderAddress.
// Keep the reviewed route frozen and check the current account/chain/balance.
const prepared = await client.prepareSwap({
  quote,
  account,
  signal: settlementController.signal,
});
const signature = await dexWallet.signOrder(prepared.signingRequest);
// Recheck the active context before submitting. Do not reprepare after signing.
const order = await client.submitSignedSwap(prepared, signature, { signal: settlementController.signal });
// The returned order is filled; settlement was tracked internally.
```

`dexWallet.signOrder` above represents the DEX's existing EIP-712 signing code;
pass the returned `signerAddress` and `typedData` to that wallet. Forward the
original signature unchanged. Prepare after wrapping and confirmed approval,
immediately before signing, so start/deadline/nonce are fresh.
`prepared.approvalRequest` also exposes the configured token, amount, and spender.
`prepareSwap` uses `account` for the signer and recipient, and signs the
original quote's authoritative `minimumAmountOut`. Display that exact value in review;
the service has already applied the requested slippage. Pass it unchanged and
do not apply slippage a second time.
`quote.request.user` records the quote request and may be a disconnected preview
address; it does not bind the signing account.
`prepareSwap` checks quote age internally. By default, a quote up to
20,000 ms old skips the HTTP request; an older quote, a future timestamp, or an
invalid timestamp triggers a refresh. Direct callers can set the finite,
non-negative `maxQuoteAgeMillis` option; `0` always forces a refresh. Callers do
not need a separate `isQuoteFresh` check.

When refreshing, the helper replays the original request, including its preview
`user`, `slippage`, and `dexMinAmountOut`, through the client's configured endpoint.
It compares the refreshed `minimumAmountOut` with the original reviewed
`quote.minimumAmountOut`. A lower minimum throws `SpotError` with code
`QUOTE_MINIMUM_DECREASED` before signing; obtain a new quote and let the user review it.
An equal or higher minimum prepares the original quote and preserves its exact
reviewed minimum. Both paths prepare fresh signing timestamps and a new nonce;
they do not mutate the quote or its request. Age is a local reuse heuristic,
not a server expiry or execution guarantee; the signed minimum stays protected.

```ts
// Force a refresh even when the reviewed quote was just received.
const prepared = await client.prepareSwap({
  quote,
  account,
  signal,
  maxQuoteAgeMillis: 0,
});
```

`prepareSwap` is asynchronous and accepts a `PrepareSwapParams` object.
The old synchronous positional signature is removed.
`client.submitSignedSwap(prepared, signature, options?)` accepts the complete `PreparedSwap`
returned by preparation and the original wallet signature. It forwards `prepared.order`
to the same submission flow without preparing or signing again. It returns the
completed `Order` after internal settlement tracking. `client.submitSignedOrder`
also waits for swaps; advanced orders return at acceptance. Neither signed
submission method performs wallet operations.

Both submission methods accept an optional `{ signal }`. Their submission request
has a fixed 30-second timeout covering the POST and response-body read; swap
settlement then uses its separate deadline-based bound. A pre-aborted signal prevents the
POST. An abort or timeout after sending leaves acceptance uncertain; reconcile
the signed order before another submission. The SDK never retries this POST automatically.

All swaps have a fixed 3-minute expiration from preparation, immediately before
signing. Calculated form swaps prepared with `prepareOrder` use the same duration
and ignore duration overrides. `PreparedSwap.values.deadlineMillis` exposes the
prepared expiration as Unix milliseconds.

See the complete typed [router adapter](examples/router-swap.ts), including DEX
minimum comparison, capability gating, preparation, signed submission, and tracking.
The host implements balance/minimum-trade checks, live account/chain validation,
abort handling, and a duplicate-submit lock through settlement. Recheck context
before every wallet step and submission; once submission starts, retain any
accepted order ID even if the form unmounts. Pause/cancel quote requests while
executing and preserve the reviewed minimum. Raw protocol preparation needs no
USD prices; form integrations can retain `calculateOrder` for display/validation.

### Migrating to quote-based preparation

Use `await client.prepareSwap({ quote, account, signal })` to handle
quote freshness, validate a refreshed minimum, and prepare the reviewed order.
Replace positional `client.prepareSwap(quote, userAddress)` calls with this
object-based async call, and await the result before reading the signing request.
After signing, use `client.submitSignedSwap(prepared, signature, { signal })` to submit
that exact prepared swap. Use `client.submitSignedOrder(order, signature, { signal })`
for signed generic and advanced orders.
Prefer `client.executeSwap({ quote, account, walletInteractions, ...options })`
for SDK wallet orchestration; it performs the same refresh check internally.
Replace package-level execution calls with the configured client's methods.
Remove the `client` argument, rename execution `userAddress` to `account`, and
use `ExecuteSwapParams` for the options. Standalone execution helpers and the
`SubmitSwapParams` compatibility type are removed.
Remove `minimumOutputAmountRaw`, `swapperAddress`, `recipient`, and `tradeType`
from swap execution calls. Route capability checks stay in
`isSwapSupported`; live wallet identity checks stay in the host's wallet flow.
Refresh quotes when their amount, pair, chain, partner, or slippage changes.
A disconnected preview quote can be prepared for the connected account without
refetching solely to change its quote-request user.
`PreparedSwap.values.minimumOutputAmountRaw` still exposes the signed minimum.

### Quote identity, errors, and comparison units

Quotes include a frozen `request` identity and local `receivedAt` timestamp. Match
all request inputs before using a cached quote. `isQuoteFresh(quote, maxAgeMillis)`
remains available for host UI/cache policy and compatibility, but
`prepareSwap` already uses it internally. It checks local age, not
server expiry or execution availability. Wallet steps never silently
replace the reviewed minimum. The quote-request user is metadata; execution uses
the separately supplied `account` and live wallet context checks.

SDK validation, configuration, and execution failures use `SpotError` with a
stable `code`. Check `error instanceof SpotError`, then `error.code` (for example,
`"EXECUTION_IN_PROGRESS"`), rather than matching message text. `cause` preserves
an underlying failure; `status` and `serviceCode` retain HTTP/service details
when available. A `"SUBMISSION_FAILED"` error can still mean acceptance is
uncertain: reconcile the signed order before starting another swap.

`QuoteError` preserves `kind`, HTTP `status`, server `code`, and `retryable`.
Network failures, HTTP 429, and 5xx responses are retryable. A 204 empty offer uses
`kind: "no-quote"`. Other service rejections retain their actual status/code;
classify supported server codes in the adapter rather than guessing from message
text or treating every failure as "no offer". Caller cancellation is preserved.
`QuoteError`, `OrderSettlementError`, wallet rejections, and abort errors retain
their existing contracts; they are not replaced by `SpotError`.

`netAmountOut` is the service's reported net output and `feeAmount` its reported
raw fee; the SDK does not invent USD gas costs or equate these fields with legacy
Liquidity Hub gas-adjusted fields. Keep the host's gas comparison policy explicit.
`quote.minimumAmountOut` is the service's authoritative protected minimum in raw
output-token units. Use it unchanged for review, form input, and signing.

`quote.inputAmountUsd`, `quote.netAmountOutUsd`, and `quote.minimumAmountOutUsd` expose
the service's input, net output, and minimum output USD values as decimal strings.
`quote.priceImpactPercentage` is a signed decimal
percentage string (for example, `"-0.0333"`). These fields preserve the service's
values and are optional when omitted by the service. They are display metadata;
use the raw token amounts above for order calculation and signing. The same
fields are available through the `@orbs-network/spot-react` reexports.

`calculateOrder` accepts optional `inputAmountUsd: quote.inputAmountUsd`,
`quotedOutputAmountUsd: quote.netAmountOutUsd`, and
`minimumOutputAmountUsd: quote.minimumAmountOutUsd` for the current quote. The input
USD total is retained exactly; swaps also retain the exact output and minimum USD
totals. Other modules value their edited output amounts using the token prices.

## Order lifecycle

For a form-driven UI (the raw router path above does not require a form):

1. Reuse a client for the selected partner and chain. Quote the current amount.
2. Calculate the form and display its amounts and validation errors. Submit only
   when `form.canSubmit` is true.
3. For SDK-managed execution, provide `shouldWrap` and `wrapNativeToken` in the
   wallet adapter. The user can review first; execution awaits the predicate,
   confirms any wrapping, then approval to `client.spenderAddress`. For the
   manual preparation/signing path, the host performs these steps itself.
4. Call `prepareOrder` immediately before signing. Sign its `signingRequest` with
   the host wallet, then pass the original signature to `submitSignedOrder`.
5. Await the execution/submission method. Swaps resolve with `OrderStatus.Completed`
   after internal settlement; advanced orders resolve at acceptance. Do not start
   another poller for the same operation.

Disable concurrent submissions. If submission fails ambiguously, reconcile the
order's status before creating another signed order; the service may already
have accepted the first request.

## Swaps: quote plus one limit order

A calculated form swap uses `Module.SWAP` and `OrderType.SWAP` for display while
signing a minimum-output limit trade in the protocol. It has
one trade, no trigger, and a fixed 3-minute expiration, ignoring duration overrides.
The signed deadline is 3 minutes after preparation. The host supplies the
minimum output from the current quote's `minimumAmountOut`. User-entered
limit prices and trade counts do not override the swap quote.

V2 order history identifies swaps by a signed lifetime of exactly three minutes,
one trade, zero epoch, a positive minimum output, and no trigger. It uses the signed
start and deadline rather than the service creation time, so wallet signing delays
do not change the label. An otherwise identical manually constructed order also
receives the Swap type; the protocol has no separate module marker.

These values have different jobs:

| Value | Units and meaning |
| --- | --- |
| `getQuote.slippage` | Percentage: `0.5` means 0.5%; the SDK sends `50` integer basis points to the quote service (rounded to the nearest bps) |
| `quote.netAmountOut` | Raw output-token amount used as `quotedOutputAmountRaw` |
| `quote.minimumAmountOut` | Authoritative protected raw minimum returned by the quote service |
| `minimumOutputAmountRaw` | Form input set directly to `quote.minimumAmountOut` |
| `form.values.slippageBps` | Signed oracle-protection field; always `500` (5%) for swaps |
| `priceProtectionPercent` | Configurable signed protection for other modules; ignored for swaps |

For example, if the service returns net output `1000000` and minimum output
`995000`, use that returned `995000` directly as `witness.output.limit`.
The same order signs `witness.slippage = 500`; the UI setting does not replace
that fixed 5% field.

Never recompute the returned minimum or convert raw token amounts to JavaScript
`Number`. A missing minimum, a minimum below one
base unit, or a minimum above the net quote blocks submission. Once the other
required inputs are ready, the form reports `InputErrors.INVALID_SWAP_MINIMUM`
through `form.errors.primary` and `form.errors.swapMinimum`; display that error
and refresh or correct the host quote/minimum pair.

### Read-only quote example

```ts
import { createClient, Partners } from "@orbs-network/spot-ui";

const client = await createClient(Partners.Thena, 56);
const quote = await client.getQuote({
  inToken: "0x55d398326f99059fF775485246999027B3197955", // USDT
  inAmount: "200000000000000000000", // 200 tokens with 18 decimals
  outToken: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
  user: "0x0000000000000000000000000000000000000001", // Preview account
  slippage: 0.5,
  dexMinAmountOut: "-1",
});
console.log(quote.netAmountOut);
```

`client.getQuote` supplies its configured chain and partner, so the caller passes
only quote inputs. Use standalone `getQuote({ chainId, partner, ...inputs })` when
quoting without initialized client configuration.

For a disconnected preview, `user` remains required: pass a preview account such
as the one above and include it in the quote cache key.
At execution, pass the connected account as `account`; the quote-request user
does not need to match it. A refetch solely to bind the signer is unnecessary.
Use the wrapped-token address when
quoting native input. `dexMinAmountOut` is optional,
defaults to `"-1"`, and is sent as `outAmount` in the request body. `signal`
cancels the quote request. This function does not open the wallet, return a
prepared order, or submit anything.

### Complete typed swap example

Copy [`examples/swap.ts`](./examples/swap.ts) into the host application. It uses
only public SDK exports and contains two separate operations (the router example above avoids a calculated form entirely):

- `createSwapPreview(params)` fetches a quote and returns its calculated form.
  Supply host token metadata, the connected account, balance, USD prices, and
  minimum trade size. Supply the protocol ERC-20 input address (the wrapped token
  for a native selection), and the spendable selected-input balance. Configure
  `wallet.shouldWrap` to return true when that balance is native funds.
  Convert the UI input with the host's token
  library and pass its matching integer `inputAmountRaw`. Its default `slippage: 0.5` means 0.5% for the quote
  request; the preview passes `quote.minimumAmountOut` unchanged to the form.
- `submitReviewedSwap(preview, wallet)` checks/approves allowance, prepares
  the order, signs, and submits. Its `SwapWallet` interface includes `shouldWrap`
  and confirmed native wrapping alongside allowance/approval/signing; these are the methods the host adapts to its wallet library and delegates execution to `client.executeSwap`. It returns the completed swap
  and its protocol-rounded expiration after a confirmed fill.

Render `preview.form` for review, then pass that same snapshot to submission.
Refresh the preview after an amount, token, account, chain, partner, or UI
slippage change. Keep pending wallet operations tied to the reviewed account
and chain. The example is reference code, not another SDK export. It is checked
against the built public API on every SDK build.

## Tracking one order

Use the `order.id` returned by submission:

```ts
import { OrderStatus } from "@orbs-network/spot-ui";

const current = await client.getOrder({
  orderId: order.id,
  signal: abortController.signal,
});
if (current?.status === OrderStatus.Completed) {
  console.log("Swap completed", current.fills);
}
```

`getOrder` queries `/orders?hash=<orderId>&chainId=...` on order-sink v2 using
the client's chain. It omits legacy exchange-name filters because the full
signed hash already binds the exchange. It checks the full ID and chain before
returning a normalized `Order`. Pass the full v2 `order.id`, not `historyKey`, a
legacy numeric ID, or a digest from another field.

- `undefined` means the order is not found or not indexed yet. Keep waiting.
- `OrderStatus.Open` means accepted and awaiting execution.
- `OrderStatus.Completed` confirms execution. Read actual fills from the order.
- `OrderStatus.Cancelled` and `OrderStatus.Expired` are terminal without a full fill.
- A request or malformed-response error throws. Retry temporary lookup failures
  without resubmitting the signed order.

Unknown service statuses remain `Open`, even after the deadline. Service statuses
`expired`, `failed`, and `partially_completed` map to `Expired` once the signed
deadline has passed, unless completion or cancellation takes precedence. Partial
fills remain available on expired orders; elapsed time alone does not prove expiry.

`client.getOrder` performs one request per call. Client execution and signed
submission track swap settlement internally with serial polling, bounded backoff,
and confirmation bounded by the signed `order.deadline` plus 60 seconds. Resume a
saved swap with `client.executeOrder({ order, signal })`; it does not submit again.
If confirmation remains unavailable, direct the user to order history instead of
claiming the swap completed.

`spot-react` already manages this settlement step for `Module.SWAP`. Its
`useExecution().isExecuting` stays true throughout preparation, wallet steps,
submission, and active settlement tracking. For swaps, `isSuccess` becomes true
only after the order fills. Ambiguous submission or stopped/unconfirmed tracking
sets `isUnconfirmed`; use `resumeTracking()` to check the retained order without
signing again. That state permits dismissal while blocking new submissions and
resets until reconciliation. Other modules report creation success after submission.

## Form calculation and units

`calculateOrder` is the single public calculation entry point. It is
synchronous and independent of client configuration and time. Pass editable
values under `userInput`; token decimals, quotes, balances, and USD prices belong
at the top level.

| Module | Main inputs |
| --- | --- |
| `Module.SWAP` | Full-input quote plus `minimumOutputAmountRaw`; one limit trade |
| `Module.LIMIT` | Quote and optional `userInput.limitPriceUi`; one limit trade |
| `Module.TWAP` | Quote, market/limit mode, optional trade count, interval, and duration |
| `Module.STOP_LOSS` | Quote, trigger/limit controls, market/limit mode |
| `Module.TAKE_PROFIT` | Quote, trigger/limit controls, market/limit mode |

`quotedOutputAmountRaw` must cover the complete `userInput.inputAmountUi`.
Omit stale quotes while a replacement is loading. Swap forms also require
`minimumOutputAmountRaw: quote.minimumAmountOut`; the other modules derive minimum output from their
price controls. `minTradeSizeUsd` is a positive threshold owned by the host.
Supply the quote's positive `inputAmountUsd` or the input token's positive USD
price for form readiness, and the raw balance for
balance validation. Minimum-trade-size validation applies to swaps as well as
advanced modules. Swap forms ignore `priceProtectionPercent` and
`userInput.isMarketOrder`; the shared form shape still accepts them.

| Model field | Meaning |
| --- | --- |
| `amount.raw` | Token base units as a string, used for protocol/wallet operations |
| `amount.ui` | Decimal token amount for display or editable input |
| `amount.usd` | USD display value; empty when unavailable |
| `form.values` | Authoritative raw execution values consumed by `prepareOrder` |
| `form.errors.primary` / `form.errors.all` | Primary and ordered validation errors |
| `form.isReady` / `form.canSubmit` | Whether enough inputs exist / validation allows submission |
| `form.notReadyReason` | Missing prerequisite; absent when the form is ready, even if validation prevents submission |

`OrderFormNotReadyReason` is exported for typed integration diagnostics:

| Reason | Next step |
| --- | --- |
| `empty-input` | Provide a positive input amount in the token's precision |
| `awaiting-quote` | Supply a quote for the current amount and token pair |
| `missing-usd-value` | Supply a positive quote `inputAmountUsd` or input-token USD price |
| `invalid-swap-minimum` | Pass the current quote's valid `minimumAmountOut` unchanged |
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

`displayFeePercent` calculates a display estimate only. It does not collect or
subtract a fee. Protocol fee configuration belongs to the partner/backend.

## Preparing, signing, and cancellation

`prepareOrder` rejects forms whose `canSubmit` is false. It returns:

| Field | Purpose |
| --- | --- |
| `form` | The reviewed form snapshot |
| `values` | Form values plus `currentTimeMillis` and `deadlineMillis` |
| `order` | Protocol order to sign and submit |
| `signingRequest` | `{ signerAddress, typedData }` for the host wallet adapter |
| `approvalRequest` | `{ tokenAddress, amount, spenderAddress }` for the signed input |

Call it after confirmed approval, immediately before signing. It assigns a
monotonic nonce shared across clients in the loaded SDK instance and fresh
start/deadline values. The deadline
includes a one-minute margin for advanced orders; swaps use exactly 3 minutes
with no added margin. Use the returned timestamps rather than reconstructing
them. Reuse the client across
submissions rather than creating a new client for each operation.

Return the wallet's original `0x`-prefixed signature. Do not split it into
`{ v, r, s }`, normalize its bytes, or replace it with the quote API's payload.
`submitSignedOrder` sends the prepared order and signature unchanged. `spot-ui` does
not invoke a wallet itself.

For cancellation, call `client.getCancelOrderRequest(order)`. Send its
`contractAddress`, `abi`, and `args` using the host wallet on the client's chain
and wait for confirmation. The client selects the correct v1/v2 contract and
call. Refresh the affected order afterward; indexing can lag transaction
confirmation. Build explorer links using host chain metadata.

## Account history and identity

Use `client.getAccountOrders({ account })` for the account-history UI. Swap
settlement is handled internally by execution and signed submission. Account history returns an
`AccountOrdersResult`; destructure its orders for the list:

```ts
const { orders, legacyLoaded } = await client.getAccountOrders({ account });
```

Keep these polling lifecycles
separate. Use `order.historyKey` for list/cache identity: legacy numeric IDs can
repeat across deployments. `order.id` is the protocol/display ID; only v2 IDs
are supported by `getOrder`.

History normalizes v1/v2 orders while retaining protocol names such as
`srcAmount`, `dstAmountFilled`, and fill `inAmount`/`outAmount`. These are raw
integer strings. Format them with the relevant token's decimals. `OrderFilter`
provides `All`, `Open`, `Completed`, `Cancelled`, and `Expired`.

Account history queries both order-sink v2 and the older order-sink service by
default, including the client's configured Spot adapter alongside the partner's
legacy adapters. `Partners.Quick` maps to the history service's `quickswap` key.
`getv1orders: false` limits it to order-sink v2. Separately,
`legacyOrders: false` excludes legacy TWAP subgraph history. Both default to
true. The returned `legacyLoaded` flag is true only when a configured, requested
legacy TWAP source succeeds. It is false when that source is unavailable,
disabled, or failed, and does not describe current-service completeness. Retry a
failed legacy source while retaining successful history; once loaded, it can be
cached separately from current-order polling. Account-history `page` and
`limit` apply to legacy history; the configured v2 lookup does not forward them.

For standalone order-sink searches, use `getOrders({ chainId, swapper, exchange,
page, limit, signal, getv1orders })`. Omitted filters include all values.
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
and recovery. Host callbacks do not need to repeat these SDK events.

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
| Approval requested | Actual token, spender, and approval amount |
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
Settlement reporting is internal. Resume an accepted order with
`client.executeOrder({ order, signal })`. If tracking stops or fails, retain
`OrderSettlementError.order` and `orderId` so the same intent can be checked
without signing or submitting again.

To disable analytics for a client:

```ts
const client = await createClient(Partners.Thena, 56, { disableAnalytics: true });
```

Use `disableAnalytics` when creating a client to apply the host's telemetry
preference to its operations. Standalone `getQuote` accepts
`disableAnalytics: true` as well. React hosts use the provider's `disableAnalytics`
prop. Reporting and operation association are handled internally.

Delivery is best effort: HTTP failures and timeouts are contained and never
change trading results. Initialization also works without `window`.

## Migrating from Liquidity Hub

`@orbs-network/liquidity-hub-sdk` is deprecated. Use `@orbs-network/spot-ui`
for all new swap integrations and migrate existing integrations to Spot. Existing
DEX route adapters should start with `client.prepareSwap`, DEX-owned signing,
`client.submitSignedSwap`, which waits for the fill, without a provider or calculated UI form.
`client.executeSwap` is the default flow when SDK wallet orchestration is desired.
This changes the execution flow as well as the package import.

| Liquidity Hub | Spot replacement |
| --- | --- |
| `createClient({ partner, chainId })` | `await createClient(partner, chainId)`; reuse the client for that partner and chain |
| `sdk.getQuote({ fromToken, toToken, account, ... })` | `client.getQuote({ inToken, outToken, user, ... })`; the client supplies chain and partner |
| `quote.outAmount` / `quote.minAmountOut` | `quote.netAmountOut` / `quote.minimumAmountOut`, unchanged |
| `slippage: 0.5` | Still `0.5` for 0.5%; Spot converts to integer basis points for the service |
| `dexMinAmountOut` and `signal` | Forward both to `getQuote`; use `"-1"` when no DEX minimum is available |
| Fixed Permit2 spender | Read allowance and approve using `client.spenderAddress`; `prepared.approvalRequest` exposes the configured approval data |
| Sign `quote.eip712` | Await `client.prepareSwap({ quote, account, signal })` immediately before signing `prepared.signingRequest` |
| `sdk.swap(quote, signature)` returning a transaction hash | `client.submitSignedSwap(prepared, signature)` returning a completed order |
| Wait for the swap transaction receipt | Await swap execution/submission; it tracks completion internally |

See the complete [typed swap example](examples/swap.ts). Keep input and output
amounts as integer strings, use the wrapped address for native protocol input,
implement `shouldWrap`/`wrapNativeToken` for SDK-managed execution, and preserve the
wallet's original signature. All swaps use a fixed 3-minute expiration from preparation.
All swaps sign 500 bps (5%) oracle protection independently of the UI-slippage minimum.
Do not reuse legacy Liquidity Hub quotes or signatures for Spot orders.

For React, use `@orbs-network/spot-react` with the existing `SpotProvider` and
`Module.SWAP`. The provider tracks settlement; `useExecution().isExecuting`
covers wallet steps, submission, and settlement. Pause quote requests during
execution and show success only after the order fills.

## Migrating from 1.x

Use `calculateOrder` for calculation and an initialized client for order
preparation, submission, cancellation requests, and configured history. Version 2
removed the legacy low-level order-building and submission exports. Internal
calculators and `dist/*` imports are not public entry points.

For the broader framework-neutral integration workflow, see the
[`spot-integration` guide](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-integration).

# Spot SDK

`@orbs-network/spot-ui` quotes swaps, calculates order forms, and prepares and
submits Spot orders. It supports Swap, TWAP, Limit, Stop-Loss, and Take-Profit.
It works with any TypeScript application and has no React or wallet-library
dependency. Despite its name, `spot-ui` is a framework-neutral SDK with no rendered components.
React applications can use `@orbs-network/spot-react` for provider
state, wallet-step orchestration, and settlement tracking. It includes this SDK
as a dependency and re-exports its full public API, so those applications can
install only `spot-react` and import SDK helpers and types from it.

| I'm building… | Use… |
| --- | --- |
| A React order form | `spot-react`: `SpotProvider` with `Module.SWAP` or an advanced module, then `useExecution()` |
| A DEX router with an existing wallet flow | `client.getQuote` → `client.prepareSwap` → DEX signing → `client.submitOrder` → `waitForOrder` |
| A custom flow that needs SDK wallet orchestration | `submitSwap` for swaps; `calculateOrder` + `executeOrder` with `client.prepareOrder` for advanced orders |

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
| `client.prepareSwap(quote, userAddress)` | Prepare a raw exact-input swap without UI, decimals, balances, or USD inputs | No wallet/network work |
| `submitSwap(params)` | Wrap/approve/verify/sign/submit through the host wallet | Returns a submitted intent, not a fill |
| `executeOrder(params)` | Shared wallet orchestration for a prepared order factory | Resolves at acceptance; host owns UI state |
| `waitForOrder(params)` | Track a submitted order until filled or a terminal/uncertain outcome | Serial, bounded polling with cancellation |
| `watchOrder(params)` | Stream matching order snapshots for progress/history consumers | Same tracking loop and minimal inputs as `waitForOrder` |
| `isSwapSupported(params)` / `SWAP_CAPABILITIES` | Gate unsupported exact-output/custom-recipient requests | Synchronous |
| `calculateOrder(params)` | Calculate display values, validation, and execution amounts | Synchronous; no requests |
| `client.prepareOrder(params)` | Build a fresh order and its signing/approval requests from a valid form | No requests; stamps timestamps and nonce |
| `client.submitOrder(order, signature, { signal }?)` | Submit an already signed order | One POST with a fixed 30-second fetch/body timeout; resolves at acceptance |
| `client.getOrder({ orderId, signal })` | Look up one v2 order by its full ID | One hash-filtered request; no automatic polling |
| `client.getAccountOrders({ account, ... })` | Load account history on the client's partner and chain | Fetches configured history sources |
| `client.getAccountOrdersResult(params)` | Load history with legacy-source completion information | Returns `{ orders, legacyLoaded }` |
| `client.getCancelOrderRequest(order)` | Build the cancellation contract call | Host sends and confirms the transaction |
| `getOrders(filters)` | Search history without initializing a client | Filters can span accounts, chains, and exchanges |

The SDK owns protocol configuration and order calculations. The host owns token
metadata, wrapped native tokens, balances, USD prices, form state, wallet
operations, client caching, and polling lifecycles. Use `waitForOrder` for bounded
swap settlement tracking. Keep one current form model for both review and signing.

`calculateOrderForm` remains available as a deprecated alias of `calculateOrder`
for existing integrations.

`createClient` returns a new client. Validated configuration templates share
in-flight requests and a 60-second, 32-entry LRU cache keyed by partner/chain;
each caller receives a deep copy, and failed requests are evicted. Nonces are
allocated across clients within the loaded SDK instance. The host still owns
client resource lifetime and invalidation.

## Existing DEX routers: use the SDK directly

A DEX can add Spot as one candidate in its existing quote competition without a
`SpotProvider`. Keep the DEX's form, route selector, approval UI, wallet library,
and modal. Compare like-for-like protected minima for the same raw input, token
pair, chain, and account, retaining the DEX's gas/fee ranking policy.

For existing DEX wallet flows, prefer `client.prepareSwap` → DEX signing →
`client.submitOrder`. No `walletInteractions` object is required.

```ts
import { waitForOrder } from "@orbs-network/spot-ui";
// React hosts can import the same APIs from @orbs-network/spot-react instead.

// The DEX completes native wrapping if needed, then confirms ERC-20 approval
// for quote.request.inToken/inAmount to client.spenderAddress.
// Keep the reviewed route frozen and check the current account/chain/balance.
const reviewedMinimum = quote.minimumAmountOut;
const freshQuote = await client.getQuote({ ...quote.request, signal: settlementController.signal });
if (BigInt(freshQuote.netAmountOut) < BigInt(reviewedMinimum)) {
  throw new Error("The quote moved below the reviewed minimum. Refresh and review the swap.");
}
const prepared = client.prepareSwap(quote, account);
const signature = await dexWallet.signOrder(prepared.signingRequest);
// Recheck the active context before submitting. Do not reprepare after signing.
const order = await client.submitOrder(prepared.order, signature, { signal: settlementController.signal });
// Persist the returned order in the app-level intent tracker.
const filled = await waitForOrder({
  order,
  signal: settlementController.signal,
});
```

`dexWallet.signOrder` above represents the DEX's existing EIP-712 signing code;
pass the returned `signerAddress` and `typedData` to that wallet. Forward the
original signature unchanged. Prepare after wrapping and confirmed approval,
immediately before signing, so start/deadline/nonce are fresh.
`prepared.approvalRequest` also exposes the configured token, amount, and spender.
`prepareSwap` uses `userAddress` for the signer and recipient, and signs the
quote's authoritative `minimumAmountOut`. Display that exact value in review;
the service has already applied the requested slippage. Pass it unchanged and
do not apply slippage a second time.
`quote.request.user` records the quote request and may be a disconnected preview
address; it does not bind the signing account.
`prepareSwap` constructs locally; `submitOrder` only posts the signed order and
returns the accepted order. Neither performs wallet operations or starts polling.
The manual router flow must fetch a current quote after wrapping/approval and
compare its net output against the original quote's `minimumAmountOut` before pure preparation.
Preserve the original reviewed minimum when the fresh quote still covers it;
a lower result requires a fresh review.

`submitOrder` accepts an optional `{ signal }` and has a fixed 30-second timeout
covering both the POST and response-body read. A pre-aborted signal prevents the
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

### Optional wallet orchestration

Use `submitSwap({ client, quote, userAddress: account, walletInteractions, ... })` when the host wants the SDK to coordinate wallet
steps. It reuses the executor used by `spot-react`: confirmed native wrapping,
allowance checks, confirmed approval, up to three allowance reads, late preparation,
unchanged signature forwarding, and one submission. The DEX still implements
wallet callbacks. Quotes name the wrapped ERC-20 input token; `nativeInput: true`
opts into wrapping. `completedWrapTxHash` is retry metadata for an already
confirmed wrap of this exact account/chain/token/amount.
Reusing it requires the otherwise optional
`walletInteractions.getTokenBalance({ tokenAddress })`, returning the captured
account's current wrapped-token balance as a raw integer string. The executor
checks that balance and wraps only a shortfall; progress updates expose the
actual wrapped base-unit amount as `wrapAmountRaw`.
The fixed 3-minute window starts at final preparation after wrapping and approval,
immediately before signing.
`submitSwap` and React's form executor re-quote at that point. If fresh net output
is below the original reviewed `quote.minimumAmountOut`, they reject with `INVALID_QUOTE` and require a new
review. Otherwise they sign the exact reviewed minimum. The host's paused quote
UI remains frozen during this controlled execution check.

Progress updates include `phase`, `event`, `steps`, `stepIndex`, transaction hashes,
and the prepared payload. Observers are best-effort; use `signal` and
`validateContext` to stop obsolete work before the next wallet request/submission.
The executor prevents concurrent wallet submissions per client/account. The host
owns the longer lock/loading state through settlement. `SpotProvider` continues
to use this shared orchestration for its form lifecycle.

`submitSwap` returns `{ type: "intent", status: "submitted", orderId, order,
deadlineMillis, wrapTxHash?, approvalTxHash? }`. `deadlineMillis` equals the accepted
`order.deadline`, including protocol rounding to seconds. For DEX-controlled
submission, build equivalent intent metadata from the returned `order.id` and
`order.deadline`, retaining confirmed transaction hashes in the host's state.
Neither path invents a transaction hash or reports a fill at acceptance.
`type: "intent"` lets a router distinguish this signed-order route from routes
that return an on-chain transaction hash. `status: "submitted"` records acceptance,
so this result cannot be mistaken for settlement success. These fields remain
constant because `SubmittedSwap` describes that specific lifecycle stage.
If the DEX calls this identifier `intentId`, assign `orderId` to that existing field;
otherwise retain `orderId`. Build display summaries in the host.

`waitForOrder({ order })` requires only the submitted order. No initialized client
or configuration request is needed. It derives the lookup identity from `order.id`
and `order.chainId`, and the expiration from `order.deadline`
(milliseconds), polls serially with a two-second normal delay, and stops at that
deadline plus 60 seconds for indexing. Errors or missing snapshots back off at
2, 4, 8, 16, then 30 seconds; a matching snapshot resets the delay to two seconds.
`signal` is optional for cancellation.
The promise resolves with the completed order. Progress/history consumers can
iterate `watchOrder({ order, signal })` with `for await`; React uses that same
stream to update its cache, with no second polling loop. `OrderSettlementError.reason` is
`cancelled`, `expired`, `aborted`, or `unconfirmed`; the last two are not proof that
the on-chain order failed. Never execute a DEX fallback automatically after a
signed order might have been accepted.

Capabilities currently declare exact input and signer-as-recipient only. Gate
exact-output or alternate-recipient trades with `isSwapSupported` before wallet
work. `prepareSwap` and the optional `submitSwap` derive their exact-input,
token, amount, and protected-minimum inputs from the quote, and use the explicit
`userAddress` as signer and recipient.

### Migrating to quote-based preparation

`client.prepareSwap(quote, userAddress)` takes the quote and execution account
positionally. `submitSwap` accepts `quote` and `userAddress` in its options object.
Remove `minimumOutputAmountRaw`, `swapperAddress`, `recipient`, and `tradeType`
from swap execution calls. Route capability checks stay in
`isSwapSupported`; live wallet identity checks stay in the host's wallet flow.
Refresh quotes when their amount, pair, chain, partner, or slippage changes.
A disconnected preview quote can be prepared for the connected account without
refetching solely to change its quote-request user.
`PreparedSwap.values.minimumOutputAmountRaw` still exposes the signed minimum.

### Quote identity, errors, and comparison units

Quotes include a frozen `request` identity and local `receivedAt` timestamp. Match
all request inputs before using a cached quote; `isQuoteFresh(quote, maxAgeMillis)`
is an optional local age policy, not a server expiry guarantee. The host owns
quote age checks and any refresh/review policy. Wallet steps never silently
replace the reviewed minimum. The quote-request user is metadata; execution uses
the separately supplied `userAddress` and live wallet context checks.

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

## Order lifecycle

For a form-driven UI (the raw router path above does not require a form):

1. Reuse a client for the selected partner and chain. Quote the current amount.
2. Calculate the form and display its amounts and validation errors. Submit only
   when `form.canSubmit` is true.
3. Wrap native input if necessary, check allowance, and approve the wrapped/ERC-20
   token against `client.spenderAddress`. Wallet writes must wait for confirmation.
4. Call `prepareOrder` immediately before signing. Sign its `signingRequest` with
   the host wallet, then pass the original signature to `submitOrder`.
5. For swap UX, keep loading until `getOrder` returns `OrderStatus.Completed`.
   Order acceptance alone is not swap completion.

Disable concurrent submissions. If submission fails ambiguously, reconcile the
order's status before creating another signed order; the service may already
have accepted the first request.

## Swaps: quote plus one limit order

A calculated form swap is `Module.SWAP` in the form and `OrderType.LIMIT` in the protocol. It has
one trade, no trigger, and a fixed 3-minute expiration, ignoring duration overrides.
The signed deadline is 3 minutes after preparation. The host supplies the
minimum output from the current quote's `minimumAmountOut`. User-entered
limit prices and trade counts do not override the swap quote.

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
At execution, pass the connected account as `userAddress`; the quote-request user
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
  minimum trade size. Its example default `slippage: 0.5` means 0.5% for the quote
  request; the preview passes `quote.minimumAmountOut` unchanged to the form.
- `submitReviewedSwap(preview, wallet)` wraps, checks/approves allowance, prepares
  the order, signs, and submits. Its `SwapWallet` interface describes the four
  methods the host adapts to its wallet library and delegates execution to `submitSwap`. It returns the accepted order
  and its protocol-rounded expiration, before settlement.

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

`client.getOrder` performs one request per call. Use `waitForOrder` for swap
settlement: it polls serially, normally every two seconds with bounded backoff
for errors/missing snapshots, stops at a terminal status,
supports cancellation, and bounds confirmation at the signed `order.deadline`
plus 60 seconds for indexing. The host owns when tracking starts and stops. If
confirmation remains unavailable, direct the user to order history instead of
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
Supply the input token's USD price for form readiness and the raw balance for
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

`form.inputAmount`, `outputAmount`, `minOutputAmountTotal`, `tradePrice`, and
`fees` use structured amounts. `trades` contains per-trade amounts; `schedule`
contains duration, interval, and validation. Price `raw` values are canonical
rates, and their `display` values follow `isPriceInverted`. Use `toAmountRaw`
and `toAmountUI` to convert with the correct token decimals.

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

Call it after wrapping and approval, immediately before signing. It assigns a
monotonic nonce shared across clients in the loaded SDK instance and fresh
start/deadline values. The deadline
includes a one-minute margin for advanced orders; swaps use exactly 3 minutes
with no added margin. Use the returned timestamps rather than reconstructing
them. Reuse the client across
submissions rather than creating a new client for each operation.

Return the wallet's original `0x`-prefixed signature. Do not split it into
`{ v, r, s }`, normalize its bytes, or replace it with the quote API's payload.
`submitOrder` sends the prepared order and signature unchanged. `spot-ui` does
not invoke a wallet itself.

For cancellation, call `client.getCancelOrderRequest(order)`. Send its
`contractAddress`, `abi`, and `args` using the host wallet on the client's chain
and wait for confirmation. The client selects the correct v1/v2 contract and
call. Refresh the affected order afterward; indexing can lag transaction
confirmation. Build explorer links using host chain metadata.

## Account history and identity

Use `client.getAccountOrders({ account })` for the account-history UI and
`waitForOrder({ order })` for swap settlement. Keep these polling lifecycles
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
true. Use `getAccountOrdersResult` and its `legacyLoaded` flag to recognize a
partial legacy-source result during an outage. Account-history `page` and
`limit` apply to legacy history; the configured v2 lookup does not forward them.

For standalone order-sink searches, use `getOrders({ chainId, swapper, exchange,
page, limit, signal, getv1orders })`. Omitted filters include all values.
`exchange` accepts a `Partners` value. Its `page` is zero-based, `limit` is a
positive integer, and pagination is forwarded to each selected service. Merged
results can exceed one service's limit. Standalone searches do not query legacy
TWAP subgraphs.

## Client configuration and analytics

`createClient` fetches and validates `/config` on every call. It rejects chain
mismatches and malformed or zero RePermit and exchange-adapter addresses. The
client supplies configured spender, exchange, signing data, and cancellation
requests. The host supplies wrapped native tokens and other chain metadata;
the SDK has no network registry. Cache clients/promises in the host data layer
and allow rejected initialization attempts to be retried.

Analytics initializes from validated configuration and is enabled by default.
Use `client.analytics` for lifecycle events when orchestrating operations in a
host adapter. `spot-react` wires those events already. To disable analytics:

```ts
const client = await createClient(Partners.Thena, 56, { disableAnalytics: true });
```

Telemetry delivery does not block client creation. Disabled analytics methods
remain safe to call and send no telemetry or analytics timers. The deprecated
global `analytics` export is retained for compatibility; new integrations use
the client-owned instance. Initialization also works without `window`.

## Migrating from Liquidity Hub

`@orbs-network/liquidity-hub-sdk` is deprecated. Use `@orbs-network/spot-ui`
for all new swap integrations and migrate existing integrations to Spot. Existing
DEX route adapters should start with `client.prepareSwap`, DEX-owned signing,
`client.submitOrder`, and `waitForOrder`, without a provider or calculated UI form.
`submitSwap` remains an optional convenience when SDK wallet orchestration is desired.
This changes the execution flow as well as the package import.

| Liquidity Hub | Spot replacement |
| --- | --- |
| `createClient({ partner, chainId })` | `await createClient(partner, chainId)`; reuse the client for that partner and chain |
| `sdk.getQuote({ fromToken, toToken, account, ... })` | `client.getQuote({ inToken, outToken, user, ... })`; the client supplies chain and partner |
| `quote.outAmount` / `quote.minAmountOut` | `quote.netAmountOut` / `quote.minimumAmountOut`, unchanged |
| `slippage: 0.5` | Still `0.5` for 0.5%; Spot converts to integer basis points for the service |
| `dexMinAmountOut` and `signal` | Forward both to `getQuote`; use `"-1"` when no DEX minimum is available |
| Fixed Permit2 spender | Read allowance and approve using `client.spenderAddress`; `prepared.approvalRequest` exposes the configured approval data |
| Sign `quote.eip712` | Call `client.prepareSwap` immediately before signing `prepared.signingRequest` |
| `sdk.swap(quote, signature)` returning a transaction hash | `client.submitOrder(prepared.order, signature)` returning an accepted order |
| Wait for the swap transaction receipt | Poll `client.getOrder({ orderId: order.id })` until filled, cancelled, expired, or confirmation times out |

See the complete [typed swap example](examples/swap.ts). Keep input and output
amounts as integer strings, wrap native input before approval, and preserve the
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

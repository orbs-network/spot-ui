# Swap Quotes, Execution, and Liquidity Hub Migration

Use `@orbs-network/spot-ui` for swaps. `@orbs-network/liquidity-hub-sdk` is deprecated; its quote payload, Permit2 spender, signature, and transaction-hash execution flow cannot be reused for Spot submission.

For default SDK wallet orchestration, use
`client.executeSwap({ quote, account, walletInteractions, signal })`. It coordinates
the awaited `shouldWrap` decision, confirmed wrapping when requested, allowance,
approval, late preparation, signing, submission, and settlement, returning
a `CompletedSwap` after the fill. Calculated forms use
`client.executeOrder` with their form and token addresses. The advanced path
below lets an existing DEX control each step independently.

## Existing DEX route adapters

For a DEX-owned swap form/quote competition, use the raw SDK path rather than
assembling `CalculateOrderFormParams`. Read/copy the [router example](../assets/spot-router-swap-example.ts):

Check the installed preparation declaration's parameters and return type first.
Current `prepareSwap` is async and object-based; its name alone does not
distinguish older sync positional releases. Follow the matching version path in
[Quickstart](01-quickstart.md) without inventing an unavailable method or SDK code.

1. Fetch `client.getQuote` as a candidate and use its authoritative `minimumAmountOut` unchanged for review and comparison.
2. Gate exact-output/custom-recipient requests using `isSwapSupported`; compare only matching input/pair/account/chain minima, preserving the host gas policy.
3. Keep wrapping, confirmed approval to `client.spenderAddress`, and signing in the DEX wallet flow. After verifying allowance, await `client.prepareSwap({ quote, account, signal })` immediately before signing its `signingRequest`, then call installed `client.submitSignedSwap(prepared, signature, { signal })` with the original signature. Input, output, and protected minimum are derived from the reviewed quote; `account` supplies the signer and recipient. No wallet callback object is required. Create the abort controller and execution lock before wallet work; validate the live account/chain/balance/minimum-trade policy before wallet steps and submission.
4. Await the completed `order`; submission includes internal settlement tracking. Keep the operation at app/store scope when it must outlive modal closure. Preserve `OrderSettlementError.orderId` and its optional accepted/latest `order` on uncertainty. Resume an accepted snapshot with `client.executeOrder({ order, signal })`, which performs read-only tracking without another signature or POST. React consumes internal execution progress for its caches on the same polling flow; the public form-only method does not expose a progress observer.

`client.prepareSwap` checks age internally. Quotes up to 20,000 ms old
skip the HTTP request; older, future-dated, or invalid timestamps trigger a
refresh. Direct callers can set finite, non-negative `maxQuoteAgeMillis`; `0`
forces a refresh. Both paths prepare fresh signing timestamps and a new nonce.
When refreshing, it replays the original request through the configured client,
including its preview `user`, `slippage`, and `dexMinAmountOut`.
Refreshed `minimumAmountOut` below the reviewed `quote.minimumAmountOut` throws
`QUOTE_MINIMUM_DECREASED` before signing and requires fresh review. An equal or higher
minimum prepares the original reviewed quote, retaining its exact minimum and
leaving the quote and request unchanged.
`client.submitSignedSwap(prepared, signature, options?)` accepts the
complete `PreparedSwap` and forwards its order and original signature to `submitSignedOrder`,
returning the completed `Order` after internal settlement, without preparation or
wallet work. `client.submitSignedOrder` also waits for swaps, while advanced orders
resolve at acceptance.
For SDK orchestration, prefer
`client.executeSwap({ quote, account, walletInteractions, ...options })`
with `ExecuteSwapParams`. It performs the complete wallet flow through host
callbacks. For calculated forms, `client.executeOrder` accepts the reviewed
`form`, token addresses, `account`, and wallet adapter, with only optional
`signal`. It prepares from the form's amounts/minimum directly;
use `client.executeSwap` for quote-aware refresh checks. React swap integrations
use the same client methods without a provider. Advanced `client.submitSignedSwap`
submits an already signed prepared swap and waits for its fill.
Client execution and signed submission share one internal settlement flow. Swaps resolve after a fill; limit/TWAP/other advanced orders resolve at
acceptance. Keep the host UI/loading lock until completion or reconciliation of
an uncertain outcome.

Protocol construction does not need decimals or USD prices. Preserve minimum
trade and balance policy checks in the host preflight; form-based UIs can keep
`calculateOrder` and its USD validation. Spot supports exact input with the signer
receiving the output. Gate unsupported router requests with
`isSwapSupported` before quoting or wallet work, allowing selection of another source.

## Quote contract

Use `client.getQuote({ inToken, outToken, inAmount, user, slippage, dexMinAmountOut, signal })`
when a client is already initialized; it supplies its chain and partner. The
package-level `getQuote({ chainId, partner, ...inputs })` remains available for
quotes without client configuration. Both post directly to order-sink v2 `/quote`.
A local API proxy is not required by the reference integration.

| Input | Meaning |
| --- | --- |
| `chainId`, `partner` | The connected chain and selected Spot partner |
| `inToken`, `outToken` | Protocol ERC-20 token addresses; use the configured wrapped address for a native selection |
| `inAmount` | Complete input amount as an integer string in token base units |
| `user` | Quote-request account metadata; disconnected previews may use a preview address independently of the execution account |
| `slippage` | Percentage, e.g. `0.5` for 0.5%. The SDK sends `50` integer bps, rounding to the nearest bps |
| `dexMinAmountOut` | Raw DEX minimum when available, otherwise `"-1"`; maps to the HTTP `outAmount` field |
| `signal` | Abort signal owned by the host's request lifecycle |

For disconnected previews, pass a preview account such as
`0x0000000000000000000000000000000000000001` as `user` and include it in the query
key. At execution, pass the connected account as `account`; it may differ
from `quote.request.user`. No refetch is required solely to bind the signer.
The host must validate the live connected account and chain before preparation,
wallet steps, and submission.

`quote.request` is a frozen request snapshot; `receivedAt` is local receipt time,
not server expiry. `prepareSwap` uses `isQuoteFresh` internally, so
integrators need no separate age check. The exported helper remains available
for host UI/cache policy and compatibility. Age controls reuse versus refresh;
it does not guarantee a fill or change the signed minimum. `QuoteError` retains
kind, HTTP status, server code, and retryability; distinguish empty offers (204),
supported service codes, transient errors, and cancellation. Do not invent gas
costs from net output.

Include all request inputs in the quote cache key. Reject results for an old amount, tokens, chain, partner, or slippage, and keep quote-request account changes consistent with the host's cache policy. The execution account is supplied separately. Omit both quote and minimum while a replacement loads. Cancel an obsolete request using its signal.

`await client.prepareSwap({ quote, account, signal })` accepts the reviewed
quote, execution account, and optional abort signal in a `PrepareSwapParams`
object. Await its result before reading the signing request; the old sync
positional signature is removed from current builds.
`client.executeSwap` accepts `quote` and `account` in its options object and performs
the same refresh check internally. Preparation signs the original
`quote.minimumAmountOut` unchanged and uses the execution account as signer and recipient.
Do not pass duplicate minimum, recipient, or trade-type fields into
`prepareSwap` or `client.executeSwap`. Display that same authoritative minimum in the host
review and do not apply slippage a second time.

All swaps have a fixed 3-minute expiration from final preparation immediately
before signing, after confirmed approval. `PreparedSwap.values.deadlineMillis`
retains prepared expiration metadata. `CompletedSwap.deadlineMillis` equals the
accepted `order.deadline` as Unix milliseconds, including protocol rounding.

## Optional UI form and units

Use `quote.netAmountOut` as `quotedOutputAmountRaw` and pass the returned
`quote.minimumAmountOut` unchanged as `minimumOutputAmountRaw`:

```ts
const form = calculateOrder({
  ...hostInputs,
  module: Module.SWAP,
  quotedOutputAmountRaw: quote.netAmountOut,
  minimumOutputAmountRaw: quote.minimumAmountOut,
  inputAmountUsd: quote.inputAmountUsd,
  quotedOutputAmountUsd: quote.netAmountOutUsd,
  minimumOutputAmountUsd: quote.minimumAmountOutUsd,
  userInput: { inputAmountUi, isMarketOrder: false },
});
```

Quote-request slippage uses percentages and is sent to the service as integer
bps. The returned minimum already reflects that request; do not derive another
minimum from net output. Keep raw token amounts as integer strings.

The SDK enforces one limit trade, zero triggers, `isInverted: false`, fixed 3-minute expiration from preparation, and `witness.slippage = 500` (5% oracle protection). Calculated form swaps ignore duration overrides. The UI minimum and signed oracle protection are separate. Current calculated forms accept a positive quoted `inputAmountUsd` or a finite positive `inputTokenUsdPrice` for readiness; minimum-trade-size validation still applies. Preserve available quote USD totals using the installed form API rather than requiring a unit price for every token. The raw path leaves that product policy to host validation. Do not add a display fee on top of the net quote unless explicitly required by product policy.

## Execution and settlement

Use the normal configured Spot client: wrap native input when needed, read/approve allowance using `client.spenderAddress`, verify confirmed allowance with bounded retry, prepare immediately before signing, and call installed `client.submitSignedSwap(prepared, signature, { signal })` with the original signature unchanged.
`client.executeSwap` uses `prepareSwap` after confirmed approval, immediately
before signing. The default 20-second reuse window can skip the request;
when refreshed, a lower `minimumAmountOut` rejects with `QUOTE_MINIMUM_DECREASED`
and requires a new review. Both paths preserve the original reviewed quote/minimum
and prepare new signing timestamps/nonce. React's calculated-form executor retains the original
SDK quote/request and calls the same `prepareSwap` helper after approval.
It attaches the reviewed form to the returned prepared swap without preparing
another order. Pausing host quote refresh does not disable this controlled check.

`client.submitSignedSwap(prepared, signature, { signal })` uses `submitSignedOrder`'s fixed 30-second timeout
covering fetch and the response body. A pre-aborted signal prevents submission;
an abort/timeout after sending leaves acceptance uncertain. Never retry the POST
automatically or replace the signed intent before reconciliation.

Swap methods return a filled order; advanced order methods return acceptance.
Keep one execution lock while the method is pending. Settlement uses an internal
single-order poller rather than account-history polling, so do not add another
poller. Requests are serial, normally two seconds apart; missing snapshots and
request failures back off at 2, 4, 8, 16, then 30 seconds. A matching snapshot
resets the delay to two seconds. On uncertainty preserve `OrderSettlementError.orderId`
and its optional `order`; resume an accepted snapshot through
`client.executeOrder({ order, signal })` without signing or submitting again.

- `OrderStatus.Completed`: show swap success.
- `OrderStatus.Cancelled` or `OrderStatus.Expired`: stop loading and show the terminal failure.
- No confirmation by `order.deadline` plus 60 seconds: stop tracking with an uncertain-status message directing the user to history. Do not claim the order was cancelled or resubmit it automatically.

Unknown service statuses remain `Open`, including after the deadline. Service
statuses `expired`, `failed`, and `partially_completed` map to `Expired` once the
signed deadline has passed, with completion and cancellation taking precedence.

Create the lifecycle abort controller before wallet work begins. Stop obsolete
wallet steps on account/chain changes, while retaining accepted-order tracking
at app/provider scope when transient controls unmount or the wallet changes.
Stop tracking when its owning scope is disposed; clear timers and listeners on
every exit. Do not replace the active controller on a duplicate submit attempt.
Keep the reviewed quote or form/account/chain/client snapshot immutable throughout the attempt.

Pause automatic and manual quote refresh while executing and abort an in-flight quote request. Resume quotes after a terminal execution or cleanup. Preserve the reviewed minimum during wallet steps; a replacement minimum requires user review rather than being silently signed.

When requested, account history has an independent polling lifecycle. Use
`order.historyKey` for history-cache identity and update only the submitted
order's row during settlement. Do not add account-history UI just to track a
swap. The generic [adapter example](../assets/spot-integration-example.ts)
includes quote access, an execution lock, and bounded single-order settlement tracking.
Its swap path uses `client.executeSwap` with the original quote; advanced forms
use the compact form-only `client.executeOrder` inputs.

For the optional SDK-orchestrated quote/form/wallet flow, see the [typed swap example](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/swap.ts). Its `submitReviewedSwap` resolves after the internal poller confirms the fill.

`CompletedSwap.type` is `"intent"` so a route selector can distinguish signed
orders from transaction-hash routes; its `"completed"` status identifies a confirmed
fill. Settlement is already complete when the method resolves. SDK validation and
execution failures expose stable `SpotError.code` values. Preserve the separate
`QuoteError`, settlement, wallet, and abort contracts; submission failures can be
uncertain acceptance and must be reconciled before fallback.

## Migration mapping

| Liquidity Hub | Spot |
| --- | --- |
| `createClient({ partner, chainId })` | `await createClient(partner, chainId)` |
| `client.getQuote({ fromToken, toToken, account, ... })` | `client.getQuote({ inToken, outToken, user, ... })`; chain and partner come from the client |
| `quote.outAmount`, `quote.minAmountOut` | `quote.netAmountOut`, `quote.minimumAmountOut` unchanged |
| Fixed Permit2 approval | Configured `client.spenderAddress` |
| Sign `quote.eip712` | Sign the fresh `prepared.signingRequest` |
| `client.swap` returns a transaction hash | `client.submitSignedSwap(prepared, signature)` returns a completed order after internal settlement |

Keep the legacy package only while an existing deployment still needs it. Do not recommend new Liquidity Hub integrations.

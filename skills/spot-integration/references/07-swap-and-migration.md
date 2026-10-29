# Swap Quotes, Execution, and Liquidity Hub Migration

Use `@orbs-network/spot-ui` for swaps. `@orbs-network/liquidity-hub-sdk` is deprecated; its quote payload, Permit2 spender, signature, and transaction-hash execution flow cannot be reused for Spot submission.

## Existing DEX route adapters

For a DEX-owned swap form/quote competition, use the raw SDK path rather than
assembling `CalculateOrderFormParams`. Read/copy the [router example](../assets/spot-router-swap-example.ts):

1. Fetch `client.getQuote` as a candidate and use its authoritative `minimumAmountOut` unchanged for review and comparison.
2. Gate exact-output/custom-recipient requests using `isSwapSupported`; compare only matching input/pair/account/chain minima, preserving the host gas policy.
3. Keep wrapping, confirmed approval to `client.spenderAddress`, and signing in the DEX wallet flow. After verifying allowance, call `client.prepareSwap(quote, account)` immediately before signing its `signingRequest`, then forward the original signature to `client.submitOrder`. Input, output, and protected minimum are derived from the quote; the positional `userAddress` argument supplies the signer and recipient. No wallet callback object is required. Create the abort controller and execution lock before wallet work; validate the live account/chain/balance/minimum-trade policy before wallet steps and submission.
4. Persist the returned `order` snapshot; use `waitForOrder({ order, signal })` at app/store scope when tracking must outlive modal closure. It derives the ID, chain, and deadline from the order, with no client or configuration request. It resolves with the completed order and supports optional cancellation and typed terminal/uncertain errors. React consumes the shared `watchOrder({ order, signal })` stream for progress/cache updates.

`client.prepareSwap` constructs the protocol order locally; `client.submitOrder`
posts that exact order and its signature without wallet work or automatic polling.
Manual router flows must fetch a current quote after wrapping/approval, before
pure `prepareSwap`, and compare net output against the reviewed minimum.
The optional `submitSwap` convenience function accepts `walletInteractions` when
SDK orchestration is desired. It and `spot-react` share the `executeOrder` runner;
`waitForOrder` is shared with React settlement. Submission is
accepted intent status, not a fill. The host owns the UI/loading lock through
settlement and may track multiple independently submitted intents.

Protocol construction does not need decimals or USD prices. Preserve minimum
trade and balance policy checks in the host preflight; form-based UIs can keep
`calculateOrder` and its USD validation. `SWAP_CAPABILITIES` currently declares
exact input and signer-as-recipient only. Gate unsupported router requests with
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
| `inToken`, `outToken` | Token addresses; normalize native input to the host's wrapped-native address |
| `inAmount` | Complete input amount as an integer string in token base units |
| `user` | Quote-request account metadata; disconnected previews may use a preview address independently of the execution account |
| `slippage` | Percentage, e.g. `0.5` for 0.5%. The SDK sends `50` integer bps, rounding to the nearest bps |
| `dexMinAmountOut` | Raw DEX minimum when available, otherwise `"-1"`; maps to the HTTP `outAmount` field |
| `signal` | Abort signal owned by the host's request lifecycle |

For disconnected previews, pass a preview account such as
`0x0000000000000000000000000000000000000001` as `user` and include it in the query
key. At execution, pass the connected account as `userAddress`; it may differ
from `quote.request.user`. No refetch is required solely to bind the signer.
The host must validate the live connected account and chain before preparation,
wallet steps, and submission.

`quote.request` is a frozen request snapshot; `receivedAt` is local receipt time, not server expiry. `isQuoteFresh(quote, maxAgeMillis)` is an optional helper for a host-owned age policy. The SDK does not impose a quote age limit during preparation or submission. `QuoteError` retains kind, HTTP status, server code, and retryability; distinguish empty offers (204), supported service codes, transient errors, and cancellation. Do not invent gas costs from net output.

Include all request inputs in the quote cache key. Reject results for an old amount, tokens, chain, partner, or slippage, and keep quote-request account changes consistent with the host's cache policy. The execution account is supplied separately. Omit both quote and minimum while a replacement loads. Cancel an obsolete request using its signal.

`client.prepareSwap(quote, userAddress)` takes the quote and execution account
positionally. `submitSwap` accepts `quote` and `userAddress` in its options object.
Preparation signs `quote.minimumAmountOut` unchanged and uses `userAddress` as
signer and recipient.
Do not pass duplicate minimum, recipient, or trade-type fields into
`prepareSwap` or `submitSwap`. Display that same authoritative minimum in the host
review and do not apply slippage a second time.

All swaps have a fixed 3-minute expiration from final preparation immediately
before signing, after wrapping and approval. `PreparedSwap.values.deadlineMillis`
retains prepared expiration metadata. `SubmittedSwap.deadlineMillis` equals the
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
  userInput: { inputAmountUi, isMarketOrder: false },
});
```

Quote-request slippage uses percentages and is sent to the service as integer
bps. The returned minimum already reflects that request; do not derive another
minimum from net output. Keep raw token amounts as integer strings.

The SDK enforces one limit trade, zero triggers, `isInverted: false`, fixed 3-minute expiration from preparation, and `witness.slippage = 500` (5% oracle protection). Calculated form swaps ignore duration overrides. The UI minimum and signed oracle protection are separate. The optional calculated form requires a positive input USD price for readiness and USD minimum-trade-size checks; the raw path leaves product policy to host validation. Do not add a display fee on top of the net quote unless explicitly required by product policy.

## Execution and settlement

Use the normal configured Spot client: wrap native input when needed, read/approve allowance using `client.spenderAddress`, verify confirmed allowance with bounded retry, prepare immediately before signing, and forward the original signature unchanged to `client.submitOrder`.
Both `submitSwap` and React's form executor re-quote after wrapping/approval,
immediately before preparation. Fresh net output below the original `quote.minimumAmountOut`
rejects with `INVALID_QUOTE` and requires a new review; otherwise the exact
reviewed minimum remains signed. Pausing host quote refresh does not disable this
controlled execution check.

`client.submitOrder(order, signature, { signal })` has a fixed 30-second timeout
covering fetch and the response body. A pre-aborted signal prevents submission;
an abort/timeout after sending leaves acceptance uncertain. Never retry the POST
automatically or replace the signed intent before reconciliation.

The returned order is accepted, not necessarily filled. Keep one execution lock
through settlement. Use `waitForOrder`/`watchOrder` for the submitted ID rather than
account-history polling. Requests are serial, normally two seconds apart;
errors/missing snapshots back off at 2, 4, 8, 16, then 30 seconds. A matching
snapshot resets the delay to two seconds.

- `OrderStatus.Completed`: show swap success.
- `OrderStatus.Cancelled` or `OrderStatus.Expired`: stop loading and show the terminal failure.
- No confirmation by `order.deadline` plus 60 seconds: stop tracking with an uncertain-status message directing the user to history. Do not claim the order was cancelled or resubmit it automatically.

Unknown service statuses remain `Open`, including after the deadline. Service
statuses `expired`, `failed`, and `partially_completed` map to `Expired` once the
signed deadline has passed, with completion and cancellation taking precedence.

Create the lifecycle abort controller before wallet work begins. Abort tracking on account/chain/client changes or unmount, including when those changes happen before submission resolves. Clear timers and listeners on every exit. Do not replace the active controller on a duplicate submit attempt. Keep the full form/account/chain/client snapshot immutable throughout the attempt.

Pause automatic and manual quote refresh while executing and abort an in-flight quote request. Resume quotes after a terminal execution or cleanup. Preserve the reviewed minimum during wallet steps; a replacement minimum requires user review rather than being silently signed.

Account history has an independent polling lifecycle. Use `order.historyKey` for history-cache identity and update only the submitted order's row during settlement. The generic [adapter example](../assets/spot-integration-example.ts) includes quote access, an execution lock, and bounded single-order settlement tracking.

For the optional SDK-orchestrated quote/form/wallet flow, see the [typed swap example](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/swap.ts). Its `submitReviewedSwap` resolves at acceptance; the host must still track settlement.

`SubmittedSwap.type` is `"intent"` so a route selector can distinguish signed
orders from transaction-hash routes; its `"submitted"` status identifies the
acceptance stage. Track settlement separately using the returned order. SDK validation and
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
| `client.swap` returns a transaction hash | `client.submitOrder` returns an accepted order; track the order ID until filled |

Keep the legacy package only while an existing deployment still needs it. Do not recommend new Liquidity Hub integrations.

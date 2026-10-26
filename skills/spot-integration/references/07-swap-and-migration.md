# Swap Quotes, Execution, and Liquidity Hub Migration

Use `@orbs-network/spot-ui` for swaps. `@orbs-network/liquidity-hub-sdk` is deprecated; its quote payload, Permit2 spender, signature, and transaction-hash execution flow cannot be reused for Spot submission.

## Existing DEX route adapters

For a DEX-owned swap form/quote competition, use the raw SDK path rather than
assembling `CalculateOrderFormParams`. Read/copy the [router example](../assets/spot-router-swap-example.ts):

1. Fetch `client.getQuote` as a candidate and derive its minimum with `getMinimumOutputAmount` (percentage units).
2. Gate exact-output/custom-recipient requests using `isSwapSupported`; compare only matching input/pair/account/chain minima, preserving the host gas policy.
3. Keep wrapping, confirmed approval to `client.spenderAddress`, and signing in the DEX wallet flow. After verifying allowance, call `client.prepareSwap` immediately before signing its `signingRequest`, then forward the original signature to `client.submitOrder`. No wallet callback object is required. Create the abort controller and execution lock before wallet work; validate the live account/chain/balance/minimum-trade policy before wallet steps and submission.
4. Persist the returned `order` snapshot; use `waitForOrder({ order, signal })` at app/store scope when tracking must outlive modal closure. It derives the ID, chain, and deadline from the order, with no client or configuration request. It resolves with the completed order and supports optional cancellation and typed terminal/uncertain errors. React consumes the shared `watchOrder({ order, signal })` stream for progress/cache updates.

`client.prepareSwap` constructs the protocol order locally; `client.submitOrder`
posts that exact order and its signature without wallet work or automatic polling.
The optional `submitSwap` convenience function accepts `walletInteractions` when
SDK orchestration is desired. It and `spot-react` share the `executeOrder` runner;
`waitForOrder` is shared with React settlement. Submission is
accepted intent status, not a fill. The host owns the UI/loading lock through
settlement and may track multiple independently submitted intents.

Protocol construction does not need decimals or USD prices. Preserve minimum
trade and balance policy checks in the host preflight; form-based UIs can keep
`calculateOrder` and its USD validation. `SWAP_CAPABILITIES` currently declares
exact input and signer-as-recipient only. Unsupported requests are rejected
before wallet work, allowing selection of another source.

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
| `user` | Account that will sign; previews may use the host's preview account, but refetch for the connected signer before execution |
| `slippage` | Percentage, e.g. `0.5` for 0.5%. The SDK sends `50` integer bps, rounding to the nearest bps |
| `dexMinAmountOut` | Raw DEX minimum when available, otherwise `"-1"`; maps to the HTTP `outAmount` field |
| `signal` | Abort signal owned by the host's request lifecycle |

For disconnected previews, pass a nonzero preview account such as
`0x0000000000000000000000000000000000000001` as `user`, include it in the query
key, then refetch for the connected signer before review and execution. The SDK
will reject preparation if the quote's user differs from the signer.

`quote.request` is a frozen identity snapshot; `receivedAt` is local receipt time, not server expiry. Use `isQuoteFresh`/`maxQuoteAgeMillis` only as an explicit host age policy. `QuoteError` retains kind, HTTP status, server code, and retryability; distinguish empty offers (204), supported service codes, transient errors, and cancellation. Do not invent gas costs from net output.

Include all request inputs in the quote cache key. Reject results for an old amount, tokens, account, chain, partner, or slippage. Omit both quote and minimum while a replacement loads. Cancel an obsolete request using its signal.

## Optional UI form and units

Use `quote.netAmountOut` as `quotedOutputAmountRaw`. Apply the UI slippage to that same net amount, rounding down in raw output-token base units, and pass it as `minimumOutputAmountRaw`:

```ts
// Slippage uses percentage units: 0.5 = 0.5% for both helpers.
const slippage = 0.5;
const minimumOutputAmountRaw = getMinimumOutputAmount(quote.netAmountOut, slippage);
const form = calculateOrder({
  ...hostInputs,
  module: Module.SWAP,
  quotedOutputAmountRaw: quote.netAmountOut,
  minimumOutputAmountRaw,
  userInput: { inputAmountUi, isMarketOrder: false },
});
```

`getMinimumOutputAmount` validates percentage slippage in `[0, 100%)`, uses the
same rounded integer-bps value as quoting, and rejects a minimum below one base
unit. Do not convert token amounts to JavaScript `Number`.

The SDK enforces one limit trade, zero triggers, `isInverted: false`, fixed 15-minute expiration (ignoring duration overrides), and `witness.slippage = 500` (5% oracle protection). The UI minimum and signed oracle protection are separate. The optional calculated form requires a positive input USD price for readiness and USD minimum-trade-size checks; the raw path leaves product policy to host validation. Do not add a display fee on top of the net quote unless explicitly required by product policy.

## Execution and settlement

Use the normal configured Spot client: wrap native input when needed, read/approve allowance using `client.spenderAddress`, verify confirmed allowance with bounded retry, prepare immediately before signing, and forward the original signature unchanged to `client.submitOrder`.

The returned order is accepted, not necessarily filled. Keep one execution lock and the loading UI active through settlement. Poll only `client.getOrder({ orderId: order.id, signal })`, never all account orders for this purpose. Use the complete ID; missing/indexing results and temporary network errors are retryable. Schedule the next request roughly two seconds after the last one finishes to avoid overlap.

- `OrderStatus.Completed`: show swap success.
- `OrderStatus.Cancelled` or `OrderStatus.Expired`: stop loading and show the terminal failure.
- No confirmation by `order.deadline` plus 60 seconds: stop tracking with an uncertain-status message directing the user to history. Do not claim the order was cancelled or resubmit it automatically.

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
| `quote.outAmount`, `quote.minAmountOut` | `netAmountOut`, UI-slippage-adjusted raw minimum |
| Fixed Permit2 approval | Configured `client.spenderAddress` |
| Sign `quote.eip712` | Sign the fresh `prepared.signingRequest` |
| `client.swap` returns a transaction hash | `client.submitOrder` returns an accepted order; track the order ID until filled |

Keep the legacy package only while an existing deployment still needs it. Do not recommend new Liquidity Hub integrations.

# Swap Sessions and Liquidity Hub Migration

Use the public SDK from `@orbs-network/spot-ui`. React applications can use the
same APIs from `@orbs-network/spot-react` without a provider. Preserve the host's
route selection, wallet, quote state, review modal, and progress UI. The advanced
provider and calculator support only the four advanced `OrderType` values;
swaps display quote amounts with host token metadata directly.

## Quote and review

```ts
const quote = await client.getQuote({
  inToken: protocolInputTokenAddress,
  outToken: outputTokenAddress,
  inAmount: inputAmountRaw,
  user: accountOrPreviewAddress,
  slippage: slippagePercent,
  dexMinAmountOut,
  signal: quoteController.signal,
});
```

Amounts are integer base-unit strings. Slippage is a percentage (`0.5` means
0.5%), converted to integer basis points for the API. `dexMinAmountOut` is
optional; undefined becomes `"-1"`. Preserve `quote.minimumAmountOut` unchanged
for review and comparison. The returned net/minimum already account for the
requested quote slippage; do not apply it again.

Use the configured wrapped ERC-20 protocol input address for a native selection.
Before connection, `user` can be a preview address such as
`0x0000000000000000000000000000000000000001`; execution's `account` identifies
the actual signer and recipient. Quote identity includes amount, pair, chain,
partner, preview user, slippage, and competing minimum. Withhold stale values,
cancel obsolete requests, and expose retryable quote errors through host UI.
Optional USD totals and price impact are display metadata; use host token
decimals/formatting and retain raw integer amounts for execution.

Gate unsupported exact-output or alternate-recipient routes with
`isSwapSupported` before wallet work. Compare protected minima only for matching
routes while preserving the DEX's gas/fee policy.

## Create one execution

Adapt the host wallet to `OrderWalletInteractions`. Required `shouldWrap()`
checks captured selected-input/account/chain state; required `shouldApprove(request)`
reads live host allowance for the supplied `ApprovalRequest`. Both return a
boolean or promise. False skips the corresponding write. When invoked,
`wrapNativeToken` and `approveToken` return a transaction hash after a successful
receipt, throwing on failure; they never return undefined to skip. The SDK has no
`getAllowance` callback. `signOrder` returns its original signature unchanged.
`ApprovalRequest.amount` is the exact reviewed input; `shouldApprove` compares
allowance only with it. `approvalAmount` is a suggested write cap, defaulting to
the maximum uint256. The host may follow that suggestion, approve `amount`
exactly, or choose another cap policy without mutating the SDK request.
Do not split `{ v, r, s }`, rewrite recovery bytes, or normalize signature forms.

```ts
const execution = client.createSwapExecution({
  quote: reviewedQuote,
  account,
  walletInteractions,
  signal: executionController.signal,
});
const completedOrder = await execution.run({
  onProgress(update) {
    renderProgress(update);
  },
});
```

`CreateSwapExecutionParams` captures a reviewed quote and account with wallet
callbacks. Construction validates and snapshots the review synchronously and can
throw before returning; it performs no wallet work. `run()` returns a completed
`Order`, without an additional swap-result wrapper. Keep the host's gas, balance,
and minimum-trade policy in preflight.

Keep the session in the host app/store when modal closure must not discard it.
Display quotes may continue through wrapping and approval. Freeze the output
and minimum from `execution.preparedOrder.quote` before signing, then pause
obsolete display requests. Keep duplicate guards active through completion or
reconciliation. Abort the supplied signal when the captured
wallet/review scope changes, and check that scope inside wallet callbacks before
opening prompts. Retry/balance logic belongs to the host adapter; the execution
retains its own confirmed `wrapTxHash`. Configure reporting only through
`createClient(..., { disableAnalytics })`; its quotes and execution sessions inherit that policy. Standalone quotes and
execution inputs accept no reporting override. Saved metadata does not configure
the client used for status/history reads.

## Control step timing

For UI preview, ask the execution without starting it:

```ts
const wrapRequired = await execution.shouldWrap();
const approvalRequired = await execution.shouldApprove();
renderStepPreview({ wrapRequired, approvalRequired });
```

Both methods take zero arguments and return `Promise<boolean>`; the SDK supplies
captured request data to the host callback. Checks do not transact, prepare,
emit progress, acquire a lock, or advance execution. Pending decisions are fresh;
completed/skipped own steps, signing, or acceptance make their checks return false.
Actual steps recheck, so the preview is for UI rather than a committed skip.

The host can drive the same engine with conditional steps:

```ts
if (await execution.shouldWrap()) await execution.wrap();
if (await execution.shouldApprove()) await execution.approve();
await execution.sign();
const acceptedOrder = await execution.submit();
const completedOrder = await execution.waitForCompletion();
```

`wrap()` and `approve()` return cached `TransactionStepResult` values:
`{ status: "skipped" }` or `{ status: "success", txHash }`. They may also be
called unconditionally. When a prerequisite method was omitted, `approve()`/
`sign()` checks again: fresh false records a skip; true raises a sequence error
instead of opening an earlier prompt. Host decision callbacks remain on
`walletInteractions`; execution preview methods take no arguments.
After each confirmed approval, the SDK rereads allowance through
`shouldApprove(request)` against exact `request.amount`, independently of the
suggested cap. If still required, it requests one more approval and
checks again. Continued insufficiency throws `INSUFFICIENT_ALLOWANCE` before
signing; read failures and wallet rejections stop execution. The approval step
completes only after verification, and `approvalTxHash` keeps the latest confirmed hash.
`sign()` creates fresh signing data and never opens earlier prompts. No detached signing/submission API is needed: the session stores
its exact prepared order and original signature, and `submit()` takes no arguments.

Readonly `preparedOrder`, `signature`, `wrapTxHash`, `approvalTxHash`, and
accepted/latest `order` become available on the session. `execution.order` is
updated before its progress event during `run()`; it is undefined before acceptance.
Only `run({ onProgress })` accepts an observer (`ExecutionRunOptions<T>`).
Constructors, individual steps, and `waitForCompletion()` accept no observer;
inspect session getters when driving steps directly. The run observer uses shared `OrderExecutionUpdate<T>` phase/event/step data, including
prepared and accepted snapshots. Observer exceptions/rejected promises are
ignored. Handle actual failure through the awaited method or `run()` promise.

At `sign()`, after prerequisites finish, the SDK reuses the reviewed quote when
its local receipt age is between zero and 20 seconds, inclusive. Older quotes,
invalid receipt times, and future receipt times trigger a refresh for the exact
original request. A refreshed protected minimum below the reviewed floor rejects
with `QUOTE_MINIMUM_DECREASED`; otherwise, the selected quote and its minimum
become the prepared order. Publish that prepared quote to the dialog and keep it fixed
through wallet signing and submission. Input amount, pair, account, chain, and
slippage remain captured from the confirmed review.
Every swap signs one limit trade, no trigger, a three-minute lifetime from
preparation, and fixed 500 bps oracle protection. Local quote age is not a fill
guarantee. Never mutate a prepared payload or replace its stored signature.

## Acceptance, completion, and status checks

`submit()` returns acceptance; it does not confirm a swap fill. The same
session's `run()` or `waitForCompletion()` tracks its own accepted submission
through one bounded poller. Advanced-form `run()` ends at acceptance.
Constructors accept only a new reviewed quote or calculated form, never a saved
order. Do not start another poller while a session is already tracking.

If tracking stops, preserve the execution's accepted/latest order and available
settlement error `order`/`orderId`. Query an existing ID through normal status reads:

```ts
const current = await client.getOrder({
  orderId: savedOrder.id,
  signal: statusController.signal,
});
```

This is one lookup and may return no result while indexing catches up. The host
owns any further polling with cancellation, visibility rules, and bounded retry.
It does not recreate an execution or submit anything.

A lost submission response can leave acceptance uncertain. If no ID is known,
query configured account history and match the exact originally signed payload
before replacing an intent. Preserve the original session/prepared signature pair
for that reconciliation. Never automatically repeat a POST, open another signing
prompt, or run a DEX fallback while acceptance remains unresolved.
`cancel(reason?)` stops later steps/tracking; it cannot undo a transaction or
cancel an accepted order on chain.

## Migration and UI checks

Replace old client execution/preparation/signed-submission calls with either
`createSwapExecution` or `createOrderExecution`. Use `run()` for orchestration or
control methods on one session. Pass host wallet callbacks at construction,
read stored payload/hash/order fields from the session, and handle the returned
`Order` directly. Saved orders use ordinary `client.getOrder`/`client.getOrders` reads;
there is no execution-constructor recovery input.

Liquidity Hub's Permit2 spender, payload, signature, and transaction-hash result
cannot be reused. Fetch a new Spot quote and adapt the host wallet while keeping
its route selection and UI. Keep UI Slippage in the swap form, omit advanced
trigger/limit/schedule controls, and show completion only after tracking confirms
the fill. `swap-ui` may render host-supplied progress inside the existing modal.
Direct native/wrapped conversion remains the host's normal wrap/unwrap flow.

Use the typed router example bundled with the framework-neutral guide or the
[repository router example](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/router-swap.ts).
The [typed quote preview](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/swap.ts)
uses the same session and token metadata. Inspect installed exports and matching
versioned documentation before migrating an older release; do not fake a missing
constructor or import private code.

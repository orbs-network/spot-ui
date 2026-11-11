# Client and Execution

## Client resource

Reuse `createClient(partner, chainId, options?)` through the host's existing
resource/cache pattern. The client owns validated protocol configuration,
spender, signing data, history, and cancellation requests. Partner/chain selection,
wrapped-native metadata, wallet state, and UI belong to the host. Failed client
initialization remains retryable. Do not mirror protocol configuration into a
second host store or create another client for each history poll.

Keep the client promise and execution session in non-reactive service fields or
focused host state. Subscribe UI only to the progress fields it renders. The
[adapter example](../assets/spot-integration-example.ts) illustrates advanced
orders; the [router example](../assets/spot-router-swap-example.ts) illustrates swaps.

## Wallet adapter

Adapt the host wallet to the installed `OrderWalletInteractions` interface.
Required `shouldWrap()` checks the captured selected input/account/chain and
returns a boolean or promise. False skips wrapping; true invokes `wrapNativeToken`.
Protocol input is always the configured ERC-20 address, including wrapped native.
Required `shouldApprove(request)` checks live allowance in the host and returns
a boolean or promise. False skips approval; true invokes `approveToken` with the
same `ApprovalRequest`. The SDK has no `getAllowance` wallet callback.
`request.amount` is the exact required swap/order input in token base units;
compare allowance only against this field. `request.approvalAmount` is a suggested
cap, defaulting to the maximum uint256 (`2^256 - 1`). The write callback may follow
that suggestion, approve the exact `amount`, or use host policy. Build the host
transaction without mutating the immutable SDK request. Post-receipt checks still
compare against `amount`, so a sufficient exact cap does not trigger another approval.
Transaction callbacks resolve with `Hex` after successful receipts, throw on
failure, and never use undefined to skip. `signOrder` receives the framework-neutral
signing request and returns the original `0x`-prefixed signature unchanged.
Never split `{ v, r, s }`, normalize bytes, or substitute another payload.

Viem adapters map `signerAddress` to `account` and forward the EIP-712 domain,
types, primary type, and message. Ethers adapters pass those same typed-data
fields through the host's supported signer API. Add `cancelOrder` separately
only when on-chain cancellation is in scope. Read current balances privately
inside the host's decision/transaction callbacks as needed for prerequisite and
funds checks. `walletInteractions` has no balance-reader callback or automatic
confirmed-wrap reuse policy.

## Capture one execution

```ts
const execution = client.createSwapExecution({
  quote, account, walletInteractions, signal,
});
const completedOrder = await execution.run({
  onProgress(update) {
    renderProgress(update);
  },
});
```

For a calculated advanced-order form, use
`client.createOrderExecution({ form, account, inputTokenAddress,
outputTokenAddress, walletInteractions, signal })`.
`CreateSwapExecutionParams` and `CreateOrderExecutionParams` describe these
reviewed inputs. Constructors snapshot the review and perform no wallet work.
Swaps use quote/token previews; calculated forms support only `OrderType.TWAP`,
`LIMIT`, `STOP_LOSS`, and `TAKE_PROFIT`.

`run()` returns an `Order`: completed for swaps, accepted for advanced orders.
Keep the session at app/store scope when it must survive modal closure. Acquire
host guards against duplicate submission of the same reviewed intent, pause
obsolete quotes, and keep account/chain/balance/gas and product policy aligned
with the captured attempt. Independent sessions can run concurrently for the
same account/client; repeated calls within one session share its own promises.

## Control individual steps

Preview requirements for the host UI with zero-argument execution checks:

```ts
const wrapRequired = await execution.shouldWrap();
const approvalRequired = await execution.shouldApprove();
renderStepPreview({ wrapRequired, approvalRequired });
```

Both return `Promise<boolean>` and use the host decision callbacks. The SDK
supplies its captured `ApprovalRequest` to wallet `shouldApprove(request)`.
Preview checks do not transact, prepare, emit progress, or start execution.
Pending checks are fresh; completed/skipped own steps
return false, including after signing or acceptance. Actual steps recheck
decisions. After preview, use `run()` or a conditional manual sequence:

```ts
if (await execution.shouldWrap()) await execution.wrap();
if (await execution.shouldApprove()) await execution.approve();
await execution.sign();
const acceptedOrder = await execution.submit();
const completedOrder = await execution.waitForCompletion();
```

These methods and `run()` use one engine. Unconditional `wrap()`/`approve()` calls
also work and skip writes when the wallet decision is false. For an omitted
prerequisite, `approve()`/`sign()` makes a fresh read-only check: false records a
skip, while true rejects with a sequence error instead of opening an earlier
prompt. The host implements the wallet decision callbacks; execution previews
take no arguments and supply captured request data. Each transaction step returns a cached
`TransactionStepResult`, `{ status: "skipped" }` or
`{ status: "success", txHash }`; in-flight calls share a promise. Invalid ordering
rejects. `sign()` prepares fresh data and never opens earlier wallet prompts.

`sign()` stores the exact prepared payload and original signature.
`submit()` takes no arguments and submits that stored pair once, setting
`execution.order` to the accepted snapshot. `waitForCompletion()` waits for a
fill; `submit()` acceptance alone never means a completed swap.

Readonly session fields expose `order`, `preparedOrder`, `signature`,
`wrapTxHash`, and `approvalTxHash` as they become available. Accepted/latest state
is updated before the run observer receives it. Pass observers only through
`run({ onProgress })` (`ExecutionRunOptions<T>`); constructors, explicit steps,
and `waitForCompletion()` accept no observer. The callback uses the shared
`OrderExecutionUpdate<T>` phase/event/step contract. Exceptions and rejected
observer promises are ignored; await session methods for actual success/failure.
Optional wallet phases appear only when needed. Final swap success is
`settling`/`success`; final advanced creation success is `submitting`/`success`.

Pass an `AbortSignal` and abort when the captured account, chain, or review changes.
Wallet callbacks check the captured scope before opening prompts. The execution
retains its own confirmed `wrapTxHash`; retry and wrapped-balance decisions belong
to the host adapter. Configure `disableAnalytics` only
through `createClient`; quotes and execution sessions inherit that client's
policy. Use `client.getQuote` for client-scoped quote reporting. Saved metadata
does not configure the client used for status/history reads.
Per-quote `disableAnalytics` options are rejected before analytics or quote HTTP
requests; move that option to `createClient`.
Preparation and submission remain session responsibilities. Do not reach into
private helpers, construct protocol orders, or detach signatures from their payload.

## Quote freshness and failure handling

After confirmed wallet prerequisites, swap `sign()` reuses the reviewed quote when
its local receipt age is between zero and 20 seconds, inclusive. Older quotes,
invalid receipt times, and future receipt times trigger a refresh for the exact
original request. A refreshed protected minimum below the reviewed floor rejects
with `QUOTE_MINIMUM_DECREASED`; otherwise, the selected quote and its minimum
become the prepared order. The host may keep estimates live through wrap/approval, then
freeze displayed output and minimum from `preparedOrder.quote` before the wallet
signature request. Input amount, tokens, account, chain, and slippage stay fixed.
Signing creates fresh
nonce/timestamps after confirmed wallet prerequisites. Swaps expire three minutes
from preparation and sign fixed 500 bps oracle protection. Advanced-order signing
uses the reviewed calculator values.

Submission sends one POST with a thirty-second timeout. A lost response may leave
acceptance uncertain; do not automatically submit another intent. Preserve
`execution.order` and settlement error `order`/`orderId`, or reconcile original
signed identity through history when acceptance is unknown. Wallet rejections,
`SpotError` codes, `QuoteError`, aborts, and `OrderSettlementError` retain their
specific contracts. Keep user inputs after failure and let the host offer a
deliberate retry.

After its own `submit()`, the original session can track that submission with
`waitForCompletion()`. After cancellation or terminal failure, use ordinary status
reads. Both constructors start new reviewed executions only;
they do not accept saved orders. After tracking stops, read an existing ID with
`client.getOrder({ orderId, signal })`, or reconcile the exact original signed
identity through `client.getOrders({ account })`. The host owns any further polling;
normal status/history reads never recreate an execution or resubmit it.
`cancel(reason?)` stops later steps/tracking and cannot undo a transaction or
cancel an accepted order. Use the separate on-chain cancellation request for that.

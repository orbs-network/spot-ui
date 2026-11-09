# Client and Execution

## Client Lifecycle

`createClient(partner, chainId)` returns a new frozen `SpotClient` with validated
order-sink `/config` data for the requested partner/chain and initialized analytics.
Client objects are not cached. Configuration templates share in-flight requests
and a 60-second, 32-entry LRU cache; only validated templates are retained, and
each client receives a deep copy. Failed requests are evicted. No separate
analytics initialization or `appId` is needed.

The SDK owns its configuration/quote/execution/submission telemetry and swap settlement events.
Advanced order creation finishes at submission; later fills remain available in history.
Do not repeat these events in host callbacks. Each event has a unique `_id`;
`operationId` groups one attempt, and `sessionId` connects its page-load session
(refreshing creates a new ID).
Use `eventName` and per-operation `eventSequence` to follow the steps.
`submission.succeeded` records acceptance; `settlement.filled` records a completed
swap. Payloads contain only fields relevant to their event, without duplicate
action/phase/success flags. Values are flat primitives, never objects or arrays;
batch cancellation events use one scalar order ID/version per record.
Use `disableAnalytics: true` on
`createClient` or standalone `getQuote` to opt out. Manual host wallet flows can
use `client.analytics.createOperation(context)` for isolated reporting; do not
share one mutable reporter across unrelated attempts.

Key the host resource by both partner and chain. Reuse an in-flight promise to deduplicate initialization, and remove a rejected promise so a deliberate retry can initialize again. Invalidate the old resource when either key changes. Keep the previous form mounted while initialization loads or retries; the host should show its own retryable error state.

Keep the client promise, wallet adapter, and in-flight locks in a non-reactive service/module field or framework equivalent. Reactive state should expose only the small status/error data the existing app components render. Storing the client or wallet object in broadly subscribed state causes unnecessary updates and unstable dependency chains.

Do not separately fetch RePermit configuration or copy its addresses into application configuration. Use:

- `client.spenderAddress` for allowance and approval;
- `client.getQuote` for quotes bound to the client's partner and chain;
- `client.getAccountOrders` for requested history scoped to the configured partner and chain;
- `client.getOrder({ orderId, signal })` for one submitted swap, independently of account history;
- `client.prepareOrder` for the exact protocol order, signing payload, and approval payload;
- `client.getCancelOrderRequest` for requested version-aware cancellation.

## Wallet Port

Adapt the host wallet instead of making Spot depend on a wallet library. Use
the installed `OrderWalletInteractions` contract for SDK orchestration. Extend
it with cancellation only when that feature is in scope:

```ts
import type {
  CancelOrderRequest,
  OrderWalletInteractions,
} from "@orbs-network/spot-ui";

interface SpotWalletPort extends OrderWalletInteractions {
  cancelOrder(request: CancelOrderRequest): Promise<`0x${string}`>;
}
```

Write methods must resolve only after a successful transaction receipt; throw on a reverted receipt. The signing method receives framework-neutral EIP-712 data:

- Viem adapters can pass `typedData.domain`, `typedData.types`, `typedData.primaryType`, and `typedData.message`, mapping `signerAddress` to `account`.
- Ethers adapters can pass the domain, types, and message to the signer using the host's supported Ethers version.

Return the original `0x`-prefixed signature. Do not transform it.

`OrderWalletInteractions.getTokenBalance({ tokenAddress })` is optional for a
fresh attempt and required when reusing `completedWrapTxHash`. Read the captured
account's current ERC-20 balance on the captured chain and return a raw integer
string. A past wrap receipt does not establish the remaining balance: the
executor verifies current funds and wraps only a shortfall. SDK progress updates
expose that actual amount in raw units as `wrapAmountRaw`; React's
`onWrapSuccess.amount` reports the same step in token UI units.

## Submission Sequence

For raw quoted swaps, use installed `submitSwap` for SDK wallet orchestration,
or retain the DEX wallet flow and call installed
`refreshAndPrepareSwap({ quote, account, signal })` after confirmed wallet steps.
The helper reuses quotes up to 20 seconds old, or replays the original request
and compares refreshed `minimumAmountOut` with the reviewed minimum. A decrease throws `QUOTE_MINIMUM_DECREASED` and
requires fresh review; equal or higher minima retain the original quote/minimum.
If the helper is unavailable, use the exact-request/manual minimum comparison
in [Quickstart](01-quickstart.md) with the verified older API. A raw router does
not need a calculated form or account-history UI.

For calculated-form execution, treat one click as one immutable attempt and reject concurrent attempts:

1. Capture the calculated form, tokens, account, partner, chain, and client. For swaps retain the original SDK quote/request and verify it matches the form's pair, input, and minimum before wallet writes.
2. Stop if `form.canSubmit` is false or the current wallet context no longer matches the captured account/chain.
3. Normalize native input to the wrapped-native token from the host chain configuration.
4. Read allowance for `{ tokenAddress, spenderAddress: client.spenderAddress }` against `form.inputAmount.raw`.
5. If input is native, wrap `form.inputAmount.raw` and wait for confirmation.
6. If the allowance was insufficient, approve the exact raw amount and wait for confirmation.
7. Re-read allowance with a small bounded retry to tolerate RPC indexing lag. Stop if it is still insufficient.
8. For swaps, call `client.refreshAndPrepareSwap({ quote, account, signal })`; it checks age internally, reusing quotes up to 20 seconds old or refreshing the exact request and comparing minima. A lower refreshed minimum reports `QUOTE_MINIMUM_DECREASED` and requires fresh review. Both paths prepare new signing timestamps/nonce. A direct call can use `maxQuoteAgeMillis: 0` to force refresh when supported. Sign the returned prepared swap without preparing another order. React attaches the captured form for its execution UI. For advanced modules, call `client.prepareOrder` with the captured form, normalized ERC-20 input, output token, and account.
9. Call `wallet.signOrder(preparedOrder.signingRequest)`.
10. Call `client.submitOrder(preparedOrder.order, signature, { signal })` once, using the attempt's lifecycle signal.
11. For swaps, keep loading and the execution lock while polling only the accepted order ID until a fill or terminal failure. For other modules, acceptance completes creation. Refresh balances at the appropriate lifecycle events, and history only when that feature is implemented.

Create the lifecycle abort controller before wallet work begins and stop pending
wallet steps when their captured account/chain becomes obsolete. Once submission
starts, preserve any accepted order and track it at the owning app/provider
scope; transient controls or a changed wallet must not discard it. Pause
automatic/manual quoting and cancel quote requests during execution. See
[Swap and Migration](07-swap-and-migration.md).

`prepareOrder` must run late in the sequence because it stamps `currentTimeMillis`, `deadlineMillis`, and a nonce. It does not recalculate the form and rejects `form.canSubmit === false`. Keep its returned `form` snapshot for the review/progress UI so the user sees the values that were signed.
Nonce allocation is shared across clients in the loaded SDK instance.

Submission has a fixed 30-second timeout covering fetch and response-body reads.
A pre-aborted signal prevents the POST. Abort/timeout after sending leaves
acceptance uncertain; there is no automatic POST retry. Preserve the signed
payload and reconcile it before another submission.

The returned `preparedOrder.approvalRequest` documents the same token, amount, and spender embedded in the prepared order. If the host pre-checks allowance before preparation to keep timestamps fresh, construct the check from the normalized token, `form.inputAmount.raw`, and `client.spenderAddress`, then confirm it matches the returned approval request.

## Failure Semantics

- Check SDK failures with `error instanceof SpotError` and stable `error.code`
  values such as `EXECUTION_IN_PROGRESS` or `FORM_NOT_SUBMITTABLE`; preserve
  `QuoteError`, `OrderSettlementError`, and wallet/abort contracts separately.
- Use `isTxRejected(error)` to distinguish user rejection from operational failures.
- Preserve the form after rejection or failure so the user can retry deliberately.
- A rejected approval or signing request is safe to retry after a new user action.
- Do not recursively or automatically repeat wallet prompts.
- If submission fails before receiving a definitive response, do not immediately prepare and sign another order. First reconcile recent history for the captured account/chain or present a retry decision; an ambiguous request may have reached the service.
- If account, chain, token pair, or input changes during an attempt, finish or cancel the captured attempt without mixing new state into it.

Every new calculated-form submission should calculate/validate a current form
and call `prepareOrder` again. Raw swaps use the reviewed quote and preparation
path above. Never reuse a prepared payload after its deadline context is stale.

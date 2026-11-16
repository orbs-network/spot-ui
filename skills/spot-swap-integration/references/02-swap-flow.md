# Swap Flow

Use the public SDK from `@orbs-network/spot-ui`. React applications can use the
same APIs from `@orbs-network/spot-react` without a provider. Preserve the host's
route selection, wallet, quote state, review modal, and progress UI.
Display swap amounts directly from the quote with host token metadata;
no calculated order form or provider is required.

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
0.5%), converted to integer basis points for the API. `dexMinAmountOut` is an
optional local threshold for input quotes, not a server field. A positive value
requires the returned minimum to meet it; omitted, `"-1"`, or `"0"` adds no
threshold. Positive thresholds are rejected with output targets. Preserve
`quote.minimumAmountOut` unchanged for review and comparison. The returned
net/minimum already account for the requested quote slippage; do not apply it again.

Supply exactly one positive base-unit `inAmount` or `outAmount` for the actual
token pair. Each call makes one server request; output targets are calculated by
the server without reversing the pair or searching client-side. The SDK maps
server `amountIn` to `quote.request.inAmount` and retains the output target in
`quote.requestedOutAmount`. The server minimum must cover that target.
The old `outAmount: "-1"` request sentinel is not sent.

Opening review reuses the current quote without an additional quote request.
Display its actual
amounts, percentage, and unchanged protected minimum, and prepare that reviewed
quote. The host owns cancellation, errors, refreshes, and cache identity for the
amount, direction, and pair. Preserve integer precision and freeze the resolved
`quote.request.inAmount` before wallet work. For output entry, the web demo
classifies automatic slippage once from the target token's approximate USD value.

Use the configured wrapped ERC-20 protocol input address for a native selection.
Before connection, `user` can be a preview address such as
`0x0000000000000000000000000000000000000001`; preparation's `account` identifies
the actual signer and recipient. Quote identity includes amount, pair, chain,
partner, preview user, slippage, and competing minimum. Withhold stale values,
cancel obsolete requests, and expose retryable quote errors through host UI.
Optional USD totals and price impact are display metadata; use host token
decimals/formatting and retain raw integer amounts for execution.

`isSwapSupported` describes the fixed-input router integration and still returns
false for a router's `tradeType: "exact-output"`. Independently, a
`getQuote({ outAmount, ... })` call resolves a target to a fixed input before
review and execution. Alternate recipients remain unsupported. Compare protected
minima only for matching routes while preserving the DEX's gas/fee policy.

## Host-owned wrap, approve, sign, and submit

The DEX owns the wallet flow; the core SDK accepts no wallet adapter or execution
session. Capture the reviewed quote and actual account/chain under the host's
execution lock. Use `client.spenderAddress` for allowance reads and approvals.
Read allowance before opening the wrap prompt so the review button can show its
loader while allowance is pending. Confirm native wrapping when required, then
approve only if allowance is below the exact reviewed input amount. Wait for each
successful receipt and reread allowance after approval. A wallet-edited cap may
still be insufficient; stop or retry according to host policy before signing.

`ApprovalRequest.amount` is the exact input in integer base units.
`approvalAmount` is a suggested cap, defaulting to maximum uint256; the host may
approve that cap, the exact amount, or another sufficient amount. Do not mutate
protocol requests or infer sufficiency from a confirmed hash alone.

After those prerequisites complete, prepare, sign inline, and submit:

```ts
const prepared = await client.prepareSwap({
  quote: reviewedQuote,
  account,
  signal: executionController.signal,
});
const { signerAddress, typedData } = prepared.signingRequest;
const signature = await walletClient.signTypedData({ ...typedData, account: signerAddress });
const acceptedOrder = await client.submitSwap(prepared.order, signature, {
  signal: executionController.signal,
});
```

`PrepareSwapParams` takes a reviewed quote, signer/recipient, and optional signal.
It needs no wallet callbacks. `PreparedSwap` returns the exact protocol order,
EIP-712 `signingRequest`, approval requirement, final quote, and timestamps.
Never split `{ v, r, s }`, rewrite recovery bytes, or normalize the wallet's
original signature. `PrepareSwapParams` and `SubmitSwapOptions` are public
preparation/submission types; the core takes no `walletInteractions`.
Core `SpotError` codes describe protocol/preparation/submission/read failures;
wallet failures retain the host wallet contract.

The host owns gas, balance, and minimum-trade policy, wallet/review scope checks,
progress, duplicate prevention, transaction retries, and polling. Check captured
account/chain and review identity before every prompt and submission. Keep attempt
state outside transient modals. Retain confirmed hashes immediately, including
receipts that arrive after a scope change. Aborting local work cannot undo a
transaction or cancel an accepted order. Reporting policy is configured only on
`createClient(..., { disableAnalytics })`; direct hosts own wallet/tracking telemetry.

## Quote freshness and the signature prompt

At `prepareSwap()`, after prerequisites finish, the SDK reuses the reviewed quote
when its local receipt age is between zero and 20 seconds, inclusive. Older quotes,
invalid receipt times, and future receipt times refresh the resolved reviewed
input, including for output-target quotes. Spending stays fixed; preparation
never repeats the target calculation or increases the input amount.
A refreshed protected minimum below the reviewed floor rejects with
`QUOTE_MINIMUM_DECREASED` and requires fresh review. Otherwise the selected quote
and minimum become the prepared order.

Display quotes may continue through wrapping and approval. Publish and freeze
`prepared.quote` before the wallet signature prompt and keep it fixed through
submission. Input amount, tokens, account, chain, and slippage remain captured
from review. Every swap signs one limit trade, no trigger, and a three-minute
lifetime from preparation. The reviewed DEX percentage is converted to integer
basis points in `witness.slippage` (`0.5` percent becomes `50` bps). The quoted
minimum remains unchanged in signed `witness.output.limit`. Local quote age is not
a fill guarantee. Prepare immediately before signing so confirmations do not age
the unsigned order; submit its unchanged payload and original signature.

## Acceptance, completion, and status checks

`client.submitSwap()` sends one POST with a thirty-second timeout and returns
an accepted `Order`. It does not confirm a fill. Store the accepted/latest order and check its ID:

```ts
const current = await client.getOrder({
  orderId: acceptedOrder.id,
  signal: statusController.signal,
});
```

Each call is one lookup and may return no result while indexing catches up. The
host owns a single polling lifecycle with cancellation, visibility rules, and
bounded retry. Show a swap as complete only at `OrderStatus.Completed`; keep
cancelled/expired outcomes distinct from filled orders.

A lost submission response can leave acceptance uncertain. Preserve the exact
prepared order and original signature. If no accepted ID is known, query
configured account history and match the exact originally signed payload before
replacing the intent. Normal status/history reads never sign or submit anything.
Do not automatically repeat a POST, open another signing prompt, or run a DEX
fallback while acceptance remains unresolved. Keep the original input and let
the host offer a deliberate retry after reconciliation.

## UI and integration checks

Keep slippage in the swap form, with quoted input/output and the unchanged
minimum. Display the captured percentage from `quote.request.slippage`, then
`prepared.quote.request.slippage` at signing. Use the host's existing modal and
progress UI, including native wrapping, approval, signing, submission, and fill
tracking. Direct native/wrapped conversion remains the normal host flow.

Use the [typed router example](../assets/spot-router-swap-example.ts) as a
host-owned execution skeleton after checking installed exports. The
[repository quote preview](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/swap.ts)
uses the same public preparation/signing/submission methods and token metadata.
Inspect matching versioned documentation before adapting examples; never fake
unavailable methods or import private code. For a new host's wallet, tokens,
balances, and chain support, read [Host services](04-host-services.md).

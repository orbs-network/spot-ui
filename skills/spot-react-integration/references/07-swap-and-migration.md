# Swap Flow and Liquidity Hub Migration

Use the re-exported public SDK from `@orbs-network/spot-react` without a provider.
The same methods are available from `@orbs-network/spot-ui`. Preserve the host's
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
`0x0000000000000000000000000000000000000001`; preparation's `account` identifies
the actual signer and recipient. Quote identity includes amount, pair, chain,
partner, preview user, slippage, and competing minimum. Withhold stale values,
cancel obsolete requests, and expose retryable quote errors through host UI.
Optional USD totals and price impact are display metadata; use host token
decimals/formatting and retain raw integer amounts for execution.

Gate unsupported exact-output or alternate-recipient routes with
`isSwapSupported` before wallet work. Compare protected minima only for matching
routes while preserving the DEX's gas/fee policy.

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
For an advanced form, use
`client.prepareOrder({ form, account, inputTokenAddress, outputTokenAddress })`
and the same signing/submission calls. Never split `{ v, r, s }`, rewrite recovery
bytes, or normalize the wallet's original signature.

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
invalid receipt times, and future receipt times refresh the exact original request.
A refreshed protected minimum below the reviewed floor rejects with
`QUOTE_MINIMUM_DECREASED` and requires fresh review. Otherwise the selected quote
and minimum become the prepared order.

Display quotes may continue through wrapping and approval. Publish and freeze
`prepared.quote` before the wallet signature prompt and keep it fixed through
submission. Input amount, tokens, account, chain, and slippage remain captured
from review. Every swap signs one limit trade, no trigger, a three-minute lifetime
from preparation, and fixed 500 bps oracle protection. Local quote age is not a
fill guarantee. Prepare immediately before signing so confirmations do not age
the unsigned order; submit its unchanged payload and original signature.

## Acceptance, completion, and status checks

`client.submitSwap()` returns an accepted `Order` for swaps. Advanced orders use
`client.submitOrder()` with the same acceptance behavior.
It does not confirm a fill. Store the accepted/latest order and check its ID:

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

## Migration and UI checks

Replace execution factories and core wallet/session contracts with the single
host-owned sequence: allowance → wrap if needed → approve if needed → prepare →
sign inline → submit. Move progress, confirmation, retry, and polling behavior to
the DEX's existing services. Saved orders use normal `client.getOrder`/
`client.getOrders` reads. No core execution factory or private import is needed.

Liquidity Hub's Permit2 spender, payload, signature, and transaction-hash result
cannot be reused. Fetch a new Spot quote and use `client.spenderAddress` while
keeping the host route selection and UI. Keep UI Slippage in the swap form,
omit advanced trigger/limit/schedule controls, and show completion only after
status tracking confirms a fill. `swap-ui` may render host-supplied progress in
the existing modal. Direct native/wrapped conversion remains the normal host flow.

Use the typed router example bundled with the framework-neutral guide or the
[repository router example](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/router-swap.ts).
The [typed quote preview](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/swap.ts)
uses the same public preparation/signing/submission methods and token metadata.
Inspect installed exports and matching versioned documentation before migrating
an older release; do not fake unavailable methods or import private code.

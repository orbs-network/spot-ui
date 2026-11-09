# Swaps and Liquidity Hub Migration

Install `@orbs-network/spot-react` for React integrations. It includes `spot-ui`
and re-exports the public SDK client APIs. Swaps use those client methods
without a React provider. `AdvancedOrdersProvider` and its hooks support only
TWAP, Limit, Stop-Loss, and Take-Profit orders.

Keep the DEX's existing swap form, route selector, wallet, modal, and state.
Use its review/progress components, or add `@orbs-network/swap-ui` as a
presentation layer. `swap-ui` renders the supplied state; the Spot client owns
quoting, order execution, and settlement.

## Choose the wallet flow

| Existing host flow | Spot integration |
| --- | --- |
| Let the SDK coordinate wallet steps | `client.getQuote` → review → `client.executeSwap` |
| DEX already controls wrapping, approval, and signing | `client.getQuote` → host wallet steps → `client.prepareSwap` → host signing → `client.submitSignedSwap` |

Both paths submit once and wait internally for a confirmed fill. No
`AdvancedOrdersProvider`, provider form props, or Spot React hooks are needed.
Import client APIs and types from the installed package root:

```ts
import {
  createClient,
  isSwapSupported,
  OrderSettlementError,
  type OrderWalletInteractions,
  type SwapQuote,
} from "@orbs-network/spot-react";
```

Create or retrieve a client for the selected partner and connected chain. Keep
it at a host scope that survives closing the progress modal. Reuse the host's
resource/cache pattern; do not introduce another provider just to hold it.

## Quote and review

Use `client.getQuote` when a client is available; chain and partner come from
that client. The standalone `getQuote` remains useful before client creation.

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

The protocol input address is always ERC-20, including the configured wrapped
address for a native selection. Before a wallet connects, a preview address such
as `0x0000000000000000000000000000000000000001` can satisfy `user`. It is quote
metadata; pass the actual connected signer as `account` during execution.

Amounts are integer token base units. Slippage is a percentage: `0.5` means
0.5%, which the SDK sends as 50 bps. `dexMinAmountOut` is the competing DEX's
protected minimum; omit it when there is no competing route (the SDK defaults
to `"-1"`). Preserve the exact request and display `quote.minimumAmountOut`
unchanged. Do not apply slippage again.

Include amount, pair, chain, partner, preview user, slippage, and competing minimum
in the host's quote identity. Withhold stale results while replacement requests
load, cancel obsolete requests, expose quote errors, and allow deliberate retry
while idle. `SwapQuote` can also supply input/output/minimum USD totals and price
impact for display. USD prices, a calculated Spot form, and advanced-order minimum
trade props are unnecessary for direct execution; the host still enforces its
balance, gas, and product-policy checks.

Gate exact-output or alternate-recipient requests with `isSwapSupported` before
wallet work. Spot currently supports exact input with the signer receiving output.

## SDK-coordinated execution

Adapt the host wallet to `OrderWalletInteractions`. `cancelOrder` is not part of
this swap execution contract. `shouldWrap()` decides from the captured selected
input/account/chain context and must return a boolean or a promise of one.
False skips wrapping; predicate errors stop execution. `wrapNativeToken` and
`approveToken` resolve only after successful receipts, and `signOrder` returns
the original signature unchanged.

After the user reviews the current quote and the host validates its live scope:

```ts
const result = await client.executeSwap({
  quote: reviewedQuote,
  account,
  walletInteractions,
  signal: executionController.signal,
});
// result.status === "completed"; result.order is the filled order.
```

The SDK checks `shouldWrap`, confirms any requested wrapping/approval, prepares
fresh signing data, signs, submits once, and waits for the fill. It prepares after
wallet steps so the three-minute expiration starts immediately before signing.
The pair, raw input, and protected minimum come from the reviewed quote.

Keep loading and duplicate-confirmation guards active until the promise resolves
or rejects. Pause automatic/manual quotes and cancel obsolete requests while the
captured execution is active. The host's wallet methods can update its existing
wallet-step UI; do not pass private progress/context/reporter controls to the
client and do not start a second settlement poller.

## DEX-controlled wallet execution

Use this path when the host already owns route competition and wallet steps.
Validate the current account, chain, balance, and reviewed route. Complete native
wrapping when needed, confirm ERC-20 approval to `client.spenderAddress`, and
verify allowance before preparing immediately before signing:

```ts
const prepared = await client.prepareSwap({
  quote: reviewedQuote,
  account,
  signal: executionController.signal,
});
const signature = await dexWallet.signOrder(prepared.signingRequest);
// Recheck the captured account, chain, and reviewed request before POST.
const order = await client.submitSignedSwap(prepared, signature, {
  signal: executionController.signal,
});
// order is filled; submission tracked settlement internally.
```

No `walletInteractions` object is needed for this manual path. Submit the exact
prepared order and original wallet signature; do not reprepare after signing,
split `{ v, r, s }`, rewrite the recovery byte, or normalize signature forms.

Inspect the installed preparation declaration before adapting an older release.
Current builds accept the object above and return a promise. They reuse quotes
up to 20,000 ms old; older, future-dated, or invalid timestamps refresh the exact
original request, including preview `user`, slippage, and `dexMinAmountOut`.
Direct callers can set finite, non-negative `maxQuoteAgeMillis`; `0` forces refresh.
A lower refreshed `minimumAmountOut` throws `QUOTE_MINIMUM_DECREASED` before
signing and requires a new review. Equal or higher minima prepare the original
quote with its exact protected minimum. Both paths create fresh timestamps and
nonce. Local age is a reuse heuristic, not an execution guarantee.

Do not invent a newer error code or freshness behavior for an older sync API.
Follow the installed-declaration fallback in [Quickstart](01-quickstart.md).

## Completion and recovery

`client.executeSwap` returns `CompletedSwap` with `status: "completed"` after the
order fills. `client.submitSignedSwap` returns the completed `Order`. Acceptance
alone is not completion. Expired/cancelled orders fail; temporary lookup failures
are retried internally within the bounded settlement window.

An `OrderSettlementError` retains `orderId` and an optional accepted/latest `order`.
Keep those values at host scope when tracking stops. Aborted or unconfirmed
tracking does not prove that the order failed; never automatically submit a
replacement intent or DEX fallback. Resume a retained order with the same client:

```ts
const completed = await client.executeOrder({
  order: savedOrder,
  signal: recoveryController.signal,
});
```

This overload only reads status; it does not open the wallet or submit again.
Unknown acceptance without a saved order requires reconciling the original signed
intent against history before another submission. The host owns this recovery UI
and its local state; `useExecution` and `resumeTracking` belong to advanced-order
provider forms.

## Swap UI and migration checks

- Keep UI Slippage in the host form. The reviewed minimum already includes it;
  the signed oracle-protection field stays fixed at 500 bps (5%).
- Show input/output amounts, minimum received, recipient, and the host's normal
  review acceptance. Advanced trigger/limit-price, trade-count, interval, and
  expiration inputs are unnecessary; swaps expire three minutes after preparation.
- Keep progress visible through settlement and show “Swap completed” only after
  the awaited execution/submission method confirms the fill.
- `swap-ui` can render review, loading, success, and failure inside the DEX's
  existing modal. Drive it with host state around the client promise.
- Handle direct native/wrapped conversion through the DEX's normal wrap/unwrap
  flow; it does not need a Spot quote or order.
- Liquidity Hub payloads and signatures cannot be submitted as Spot orders.
  Replace quote/spender/signing/submission contracts while preserving the host UI.

The bundled screenshots show advanced order modules. For a typed provider-free
router example, see [router-swap.ts](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/router-swap.ts)
and the [SDK migration guide](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/README.md#migrating-from-liquidity-hub).

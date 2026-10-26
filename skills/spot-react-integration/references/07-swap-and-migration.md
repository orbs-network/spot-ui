# Swap Panel and Liquidity Hub Migration

Install only `@orbs-network/spot-react` for React integrations. It depends on `spot-ui` and re-exports its full public SDK API, including quotes and execution helpers. Liquidity Hub is deprecated. Use the same `SpotProvider` API with `module={Module.SWAP}`; an additional swap-specific provider is unnecessary. Separate provider instances are appropriate only for independently mounted forms with independent state.

## Existing route competition can use SDK helpers without a provider

When the DEX owns a route selector and execution callbacks, do not require a
provider around the whole form. Import the SDK helpers from `@orbs-network/spot-react` and add a Spot source using `client.getQuote`,
`getMinimumOutputAmount`, `client.prepareSwap`, `client.submitOrder`, and app-level
`waitForOrder`. Keep wrapping, confirmed approval to `client.spenderAddress`, and
EIP-712 signing in the DEX wallet flow. Prepare immediately before signing and
forward the original signature unchanged. No `walletInteractions` object or
provider is required. The raw path needs no calculated UI form or USD display inputs;
the host still enforces balance and minimum-trade policy. See the [typed router
example](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/examples/router-swap.ts).
Exact-output and alternate recipients must be gated with `isSwapSupported`.

The provider workflow below remains appropriate when using Spot's calculated
React form and execution state. React reuses the same SDK executor and poller.
`submitSwap` remains an optional convenience for hosts wanting that executor
without a provider; only that orchestration path requires wallet callbacks.

## Quote adapter outside the provider

Import `getQuote`, `getMinimumOutputAmount`, and their types from `@orbs-network/spot-react`. These plain functions work outside `SpotProvider`; a separate `spot-ui` install is unnecessary. Use the host's existing query/state library; neither Spot package requires TanStack Query.

Use `client.getQuote({ inToken, outToken, inAmount, user, slippage, dexMinAmountOut, signal })`
when a client is available; its chain and partner are supplied automatically.
The standalone `getQuote({ chainId, partner, ...inputs })` remains useful for a
quote adapter that runs before client initialization. Slippage uses percentages
(`0.5` means 0.5%); the SDK sends integer bps (`50`) to order-sink v2. Preserve all
request inputs from the old Liquidity Hub hook: map `fromToken`/`toToken` to
`inToken`/`outToken`, `account` to `user`, and pass the DEX minimum (or `"-1"`) and
abort signal. Normalize native input to its wrapped address. The SDK calls `/quote` directly.

Before connection, use a nonzero preview account such as
`0x0000000000000000000000000000000000000001` for the required `user` field.
Include it in the query key and refetch for the connected signer before review
and execution. A preview quote cannot be prepared for a different signer.

Use `getMinimumOutputAmount(quote.netAmountOut, slippage)` with that same
percentage to calculate the minimum in raw base units. Pass both amounts:

```tsx
const hasQuote = Boolean(quote);
const marketQuote = useMemo(() => ({
  quotedOutputAmountRaw: isCurrent && !isLoading ? quote?.netAmountOut : undefined,
  minimumOutputAmountRaw: isCurrent && !isLoading ? minimumOutputAmountRaw : undefined,
  isLoading,
  noLiquidity: !isLoading && !hasQuote,
}), [isCurrent, isLoading, quote?.netAmountOut, minimumOutputAmountRaw, hasQuote]);

// Other account, wallet, token, balance, and USD-price props are unchanged.
<SpotProvider module={Module.SWAP} marketQuote={marketQuote} {...otherProviderProps} />
```

Include amount, token pair, chain, partner, signer, and UI slippage in the query key/freshness check. Withhold both amounts while stale or loading. Render quote errors in the host form and allow a deliberate retry while idle. A positive input USD price is still required for readiness and minimum-trade validation. Avoid adding a fee estimate to already-net swap output; the reference app uses `displayFeePercent={0}` for swaps.

If the other required inputs are ready but the minimum is missing or invalid,
`useInputErrors()` reports `InputErrors.INVALID_SWAP_MINIMUM`. Translate and
render that validation error; the submit button remains disabled without an
indefinite loading spinner.

## Pause quoting through execution

`useExecution()` must run inside `SpotProvider`, while the host quote adapter may be outside. Bridge only its `isExecuting` flag to the existing DEX query/store controller. Keep this synchronization in a small provider child or existing form component; do not introduce a second global state library.

When `isExecuting` is true:

1. Disable automatic quote fetching, including key-change, mount, reconnect, and interval refreshes.
2. Cancel any in-flight quote request using the query library's cancellation API/abort signal; disabling a query alone does not cancel it.
3. Gate explicit `refetch`/retry actions, which can otherwise bypass a disabled query.

Resume quoting when execution becomes terminal and release pause state on unmount. Preserve the current quote data while paused; the SDK freezes the reviewed form for the active attempt. In the [skeleton](../assets/spot-form-skeleton.tsx), `onQuotePauseChange` is a DEX-owned callback: implement it to disable automatic/manual refresh and cancel active requests. Stabilize it with the host's existing state/query primitives.

## Execution semantics

`isExecuting` remains true through preparation, wrapping, approval, signing, submission, and settlement. `status` stays `LOADING` while the submitted order is pending. Swap execution transitions `SUBMITTING → SETTLING → SUCCESS | FAILED`; `isSuccess` is true only after a fill. Use `phase === ExecutionPhase.SETTLING` for settlement-specific text such as “Executing swap” and “Waiting for your swap to fill…”. There is no `isWaitingForFill` field.

The provider polls only the submitted order ID, serially, about every two seconds. It stops on a filled, cancelled, or expired order, or after the prepared deadline plus a 60-second indexing grace period. Transient lookup failures/indexing delays retry without resubmitting the order. Account history is independent; do not mount `useOrders()` just to make swap settlement work.

Keep the modal open, hide close/cancel controls, and block duplicate confirmation while `isExecuting`. After a terminal execution, clear the DEX input on successful close and call `startNewOrder`; on failed/rejected close preserve the input and call `returnToOrderForm`. A confirmation timeout or stopped tracking is uncertain execution status, not proof of cancellation: direct the user to order history before another swap.

`onOrderCreated` means acceptance, not swap completion. Refresh balances silently there; use `onOrderFilled`/execution success for completion feedback. `onSubmitOrderFailed` covers submission failures and is not called for settlement failures; display those through `useExecution().error`.

## Swap-specific UI

- Show the host's UI Slippage setting; hide Price Protection controls. The signed order always uses 500 bps (5%) oracle protection independently of the UI minimum.
- Hide limit/trigger price, price inversion, trade-count, trade-interval, and expiration inputs in the swap form. Its expiration is fixed at 15 minutes, ignoring duration overrides.
- In the submit modal hide both limit price and expiration. Keep input/output amounts, minimum received, recipient, and normal disclaimer acceptance.
- The success title is “Swap completed”, never “Order created”. Continue showing loading after submission while waiting for the fill.
- Handle native/wrapped direct conversion with the DEX's normal wrap/unwrap flow; it does not need a Spot quote/order.

The bundled screenshots show advanced order modules; their price and expiry rows are not swap requirements. For migration details and a typed framework-neutral example, see the [SDK migration guide](https://github.com/orbs-network/spot-ui/blob/master/packages/spot-ui/README.md#migrating-from-liquidity-hub).

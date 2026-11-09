# History and Cancellation

## Fetching History

Use the configured client so partner and chain stay aligned with order submission:

```ts
const { orders, legacyLoaded } = await client.getAccountOrders({
  account,
  signal: abortController.signal,
});
```

V2 account history uses one request per configured endpoint. The SDK supplies `swapper`, `chainId`, and `exchange` (the partner's legacy adapters plus the client's current configured Spot adapter). `Partners.Quick` uses the history service's `quickswap` key. The public `page` and `limit` options apply only to legacy history. Use `AbortSignal` when the host lifecycle can cancel an obsolete request. `legacyOrders` defaults to `true`; disable it only when the product intentionally excludes legacy TWAP orders.

The method returns `AccountOrdersResult`: `{ orders, legacyLoaded }`. Its orders
merge configured v1 and v2 history and are sorted newest first. `legacyLoaded`
is true only when a configured, requested legacy TWAP source succeeds; false also
covers an unavailable or disabled source. It does not indicate current-service
completeness. Retry a failed legacy fetch while preserving successful orders;
once legacy history loads, cache it and disable repeated legacy requests during
current-order polling.

Swap execution and signed submission include settlement internally. They query
only the submitted order, rather than polling account history, and resolve after
`OrderStatus.Completed`. Advanced limit/TWAP orders resolve at acceptance.
The internal poller uses serial requests with a normal two-second delay; missing
snapshots and request failures back off up to thirty seconds. Tracking ends by
`order.deadline` plus sixty seconds for indexing. React consumes the same
execution updates to refresh its cache, without starting another poller.

For read-only recovery of an accepted snapshot, use
`client.executeOrder({ order, signal })`. It does not sign or submit
again. Preserve `OrderSettlementError.orderId` and its optional `order` on
aborted/unconfirmed tracking; these outcomes do not establish that the order
failed. If the original deadline-plus-60-second window has passed, recovery gives
fresh status lookups up to 30 seconds without changing the signed deadline.
A saved accepted snapshot can resume directly; discover the original order in
history first only when acceptance is unknown.
Unknown service statuses remain open. Reported expired/failed/partial
statuses map to `Expired` after the deadline, with completion/cancellation taking
precedence.

Use the host data layer's polling, visibility, retry, and invalidation rules. Avoid overlapping polls, stop polling when the view is no longer active, and refetch after submission or cancellation. Do not call `createClient` for every poll.

Cache history by partner, chain, account, and whether legacy history is enabled. Include page and limit only when explicitly paginating legacy v1 history. Preserve object identity for unchanged orders keyed by `historyKey`, and update only the existing history rows whose normalized data changed. Keep polling status separate from the form state so a background refresh does not rerender the whole order form.

## Identity and Units

- Use `order.historyKey` as the list key and cache identity.
- Use the complete v2 `order.id` for single-order settlement lookup and protocol display/cancellation. Legacy numeric IDs may repeat across TWAP contract deployments.
- History intentionally retains protocol names such as `srcAmount`, `dstAmountFilled`, and fill `inAmount` / `outAmount`.
- History amounts are raw integer strings. Format them with the matching token decimals before display.
- `getOrderFillDelayMillis(order)` normalizes v1 seconds and preserves normalized v2 milliseconds.
- `getOrderExecutionRate`, `getOrderLimitPriceRate`, and `getTriggerPriceRate` can derive display rates when the host has the correct token decimals.
- `OrderStatus` contains `Open`, `Completed`, `Cancelled`, and `Expired`; `OrderFilter` supplies equivalent filters plus `All`.

## Cancellation

Never choose the cancellation contract or ABI in host code. The client handles v1/v2 differences:

```ts
const request = client.getCancelOrderRequest(order);
const txHash = await wallet.cancelOrder(request);
await refreshOrders();
```

The wallet adapter should send `request.contractAddress`, `request.abi`, and `request.args` on `client.chainId`, wait for the confirmed receipt, and return the transaction hash. Disable duplicate cancellation while one is pending.

Build explorer links from `txHash` and the host's connected-chain metadata. Spot does not expose a network registry or explorer URL.

After confirmation, refetch history instead of mutating the order into a guessed final state. The indexing service may lag briefly, so keep bounded polling behavior and preserve the pending transaction state until the normalized order status catches up.

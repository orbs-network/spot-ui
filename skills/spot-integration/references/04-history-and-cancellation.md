# History and Cancellation

## Fetching History

Use the configured client so partner and chain stay aligned with order submission:

```ts
const { orders, legacyLoaded } = await client.getOrders({
  account,
  signal: abortController.signal,
});
const { orders: allOrders } = await client.getOrders();
```

`ClientGetOrdersParams` makes `account` optional. `client.getOrders()` and
`client.getOrders({})` read across accounts for the configured chain and partner;
pass `account` to filter one wallet.

V2 configured history uses one request per configured endpoint. The SDK supplies `chainId` and `exchange`, and adds `swapper` when `account` is provided. The `exchange` filter is the exact `Partners` enum value: `Partners.Quick` sends `quick`, with no adapter address appended. The public `page` and `limit` options apply only to legacy history. Use `AbortSignal` when the host lifecycle can cancel an obsolete request. `legacyOrders` defaults to `true`; disable it only when the product intentionally excludes legacy TWAP orders.

The method returns `AccountOrdersResult`: `{ orders, legacyLoaded }`. Its orders
merge configured v1 and v2 history and are sorted newest first. `legacyLoaded`
is true only when a configured, requested legacy TWAP source succeeds; false also
covers an unavailable or disabled source. It does not indicate current-service
completeness. Retry a failed legacy fetch while preserving successful orders;
once legacy history loads, cache it and disable repeated legacy requests during
current-order polling.

The standalone root export `getOrders(filters)` is separate: it returns
`Order[]` and accepts the order-sink `swapper` filter directly. It does not return
the client's `{ orders, legacyLoaded }` wrapper.

Swap session `run()` and `waitForCompletion()` track settlement internally. They
query only the accepted order and resolve after `OrderStatus.Completed`.
Session `submit()` returns acceptance; advanced-order `run()` also ends at acceptance.
The internal poller uses serial requests with a normal two-second delay; missing
snapshots and request failures back off up to thirty seconds. Tracking ends by
`order.deadline` plus sixty seconds for indexing. React consumes the same
execution updates to refresh its cache, without starting another poller.

For a saved accepted order or a session whose tracking has stopped, use ordinary
`client.getOrder({ orderId: order.id, signal })` status reads. It makes one lookup,
with no wallet work or new submission. The host owns any continued polling.
Before cancellation or terminal failure, the original execution can call
`waitForCompletion()` for its own accepted submission. Constructors do not accept
saved orders; stopped sessions use ordinary status reads.

Preserve `OrderSettlementError.orderId` and its optional `order` after
aborted/unconfirmed tracking; these outcomes do not establish failure. If
acceptance is unknown and no ID is available, query configured history and match
the exact originally signed payload before creating a replacement.
Unknown service statuses remain open. Reported expired/failed/partial
statuses map to `Expired` after the deadline, with completion/cancellation taking
precedence.

Use the host data layer's polling, visibility, retry, and invalidation rules. Avoid overlapping polls, stop polling when the view is no longer active, and refetch after submission or cancellation. Do not call `createClient` for every poll.

Cache history by partner, chain, optional account filter, and whether legacy history is enabled. Keep all-account and single-account results separate. Include page and limit only when explicitly paginating legacy v1 history. Preserve object identity for unchanged orders keyed by `historyKey`, and update only the existing history rows whose normalized data changed. Keep polling status separate from the form state so a background refresh does not rerender the whole order form.

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

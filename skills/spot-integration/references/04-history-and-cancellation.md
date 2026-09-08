# History and Cancellation

## Fetching History

Use the configured client so partner, chain, and exchange stay aligned with order submission:

```ts
const recentOrders = await client.getAccountOrders({
  account,
  page: 0,
  limit: 25,
  signal: abortController.signal,
});
```

Omit `page` to fetch all available pages. Use a zero-based `page`, a positive `limit`, and `AbortSignal` when the host lifecycle can cancel an obsolete request. `legacyOrders` defaults to `true`; disable it only when the product intentionally excludes v1 orders.

The method merges configured v1 and v2 history and sorts it newest first. There is no authoritative single-order endpoint. Track progress by polling a suitable recent page and matching `order.historyKey`.

Use the host data layer's polling, visibility, retry, and invalidation rules. Avoid overlapping polls, stop polling when the view is no longer active, and refetch after submission or cancellation. Do not call `createClient` for every poll.

Cache history by partner, chain, account, page, and limit. Preserve object identity for unchanged orders keyed by `historyKey`, and update only the existing history rows whose normalized data changed. Keep polling status separate from the form state so a background refresh does not rerender the whole order form.

## Identity and Units

- Use `order.historyKey` as the list key and cache identity.
- Use `order.id` for protocol display and cancellation semantics only. Legacy numeric IDs may repeat across TWAP contract deployments.
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

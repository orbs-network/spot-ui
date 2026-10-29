# History and Cancellation

## Fetching History

Use the configured client so partner and chain stay aligned with order submission:

```ts
const orders = await client.getAccountOrders({
  account,
  signal: abortController.signal,
});
```

V2 account history uses one request per configured endpoint. The SDK supplies `swapper`, `chainId`, and `exchange` (the partner's legacy adapters plus the client's current configured Spot adapter). `Partners.Quick` uses the history service's `quickswap` key. The public `page` and `limit` options apply only to legacy history. Use `AbortSignal` when the host lifecycle can cancel an obsolete request. `legacyOrders` defaults to `true`; disable it only when the product intentionally excludes legacy TWAP orders.

The method merges configured v1 and v2 history and sorts it newest first. For swap
settlement, use `waitForOrder({ order, signal })`. It derives the full signed hash,
chain, and deadline from the submitted order and performs direct single-order
lookups, without an initialized client or account-history polling. Only
`OrderStatus.Completed` confirms a fill. Requests are serial with a normal
two-second delay; errors/missing snapshots back off at 2, 4, 8, 16, then 30 seconds,
resetting after a matching snapshot. Tracking ends by `order.deadline` plus 60
seconds for indexing. Unknown statuses remain open. Service statuses `expired`,
`failed`, and `partially_completed` map to `Expired` after the deadline, with
completion and cancellation taking precedence. React consumes the same
`watchOrder` stream.

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

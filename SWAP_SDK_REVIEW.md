# DEX SDK readiness and QuickSwap compatibility

Reviewed on 29 October 2026. Scope: spot-ui, spot-react, the demo, and integration guides. The QuickSwap application migration and package publication remain outside this review.

The integration paths are implemented. Production sign-off still requires a real wallet swap and cancellation on the target deployment. No live order was signed, submitted, or cancelled as part of these checks.

## Current integration contract

- Existing DEX routers use `getQuote` → `client.prepareSwap(quote, account)` → DEX signing → `client.submitOrder` → `waitForOrder({ order })`. The optional `submitSwap` executor coordinates wallet steps; React adds form and execution state.
- Preparation takes tokens/amounts and the authoritative `minimumAmountOut` from the reviewed quote. Display, form input, and signing use that returned minimum unchanged, without applying slippage again. The explicit execution account supplies signer and recipient; a disconnected quote-request account does not require a signer-only refetch.
- All swaps have a fixed 3-minute expiration from preparation and sign separate 500 bps oracle protection. Prepare after wrapping and approval, immediately before signing. Returned intent expiration uses the accepted `order.deadline`, including protocol rounding.
- Raw `submitSwap` and React form execution re-quote after wrapping/approval. Fresh net output below the original `quote.minimumAmountOut` rejects with `INVALID_QUOTE` for fresh review; otherwise that original minimum stays signed. Manual router preparation remains pure and requires the host to perform that current-quote check.
- Exact input and signer-as-recipient are the supported swap capabilities. Gate other requests before wallet work. The host owns live wallet checks, balances, minimum-trade policy, token metadata, route ranking, and gas/fee policy.
- Completed-wrap reuse requires a current wrapped-token balance check. The executor wraps only the shortfall and reports the actual wrapped amount.
- The demo approves the exact requested raw amount and confirms the receipt.
- Submission acceptance is an intent, not a fill. Ambiguous submission or stopped/unconfirmed tracking retains the order/prepared payload and original account/chain in `UNCONFIRMED`. Recovery reads that existing attempt without signing again; new submission and resets remain blocked until reconciliation.
- `submitOrder(order, signature, { signal })` uses a fixed 30-second fetch/body timeout. Pre-abort prevents the POST; abort/timeout after sending leaves acceptance uncertain. It never retries the POST automatically.
- Settlement looks up the full order ID and chain. Errors/missing snapshots back off at 2/4/8/16/30 seconds; matching snapshots reset to two seconds. Unknown statuses remain open even after the deadline; explicit expired status is terminal only after the deadline. React cache writes check account, adapter, partner, and chain; completion callbacks include status-only changes.
- Configuration is validated and shared through a 60-second, 32-entry LRU template cache with in-flight deduplication, deep copies, and failure eviction. Clients remain separate; nonce allocation is shared within the loaded SDK instance.

Never start a DEX fallback automatically after an accepted or ambiguously submitted intent. For swaps, a confirmed fill succeeds and confirmed cancellation/expiry permits a new attempt. Advanced order creation succeeds on confirmed acceptance.

## Validation and limits

All repository test files and test scripts were intentionally removed. **No automated regression suite or retained test coverage remains.** Builds, consumer/skill typechecks, source inspection, and temporary in-memory probes provide point-in-time checks only; they do not replace regression coverage or a live wallet exercise.

Earlier reviews recorded passing test suites, package builds, editor checks, and preview configuration/quote/history lookups. Those are historical results. The 25 October live preparation measured the then-current 900-second duration; it does not validate the current 3-minute contract. Earlier browser checks covered disconnected states and layout, not connected approval, signing, fill, or cancellation.

Before production release:

- Confirm a real exact-input swap, filled order, balance refresh, and supported native wrapping.
- Check rejection, expiry, unconfirmed recovery, and cancellation on the target deployment.
- Publish spot-ui before spot-react and verify the published dependency resolves before updating the DEX.
- Retire Liquidity Hub through the explicit npm deprecation command when migration is ready; a manifest field alone does not deprecate published versions.

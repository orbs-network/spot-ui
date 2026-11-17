# Router Cutover

Use this reference when replacing a mature DEX's Liquidity Hub adapter. Preserve its routing and wallet behavior while changing the protocol contract. Chain additions, advanced-order forms, and new slippage or minimum-size policies are separate product changes.

## Preserve host configuration and slippage

Reuse the DEX's resolved automatic/custom tolerance. If it stores basis points, convert once before `client.getQuote`: `50` bps becomes `0.5` percent. The SDK uses that percentage for the quote and converts it to signed basis points during preparation. Do not add `getSwapSlippage`, a fixed 5% protection value, or an extra USD-price dependency merely because the protocol changed. Read back `quote.request.slippage`, then `prepared.quote.request.slippage`, for review.

Check native legs independently: native input uses the verified wrapped ERC-20; native output uses the native address accepted by the installed service. A wrapped output address changes what the user receives. Keep alternate-recipient and trade-direction gating explicit.

When removing legacy packages, inspect shared consumers of their re-exports and transitive dependencies. A removed SDK fork may have supplied custom chain IDs, native currencies, or wrapped-token registries. Verify those runtime mappings as well as imports. Preserve package-manager release-age restrictions; if an explicitly selected release needs an exception, scope it to the selected package/version and its required companion package rather than disabling the restriction globally.

## Map amounts by their purpose

| Consumer | Spot value |
| --- | --- |
| Input, balance, allowance, wrap, or spending display | `quote.request.inAmount`, including server-resolved output-target spend |
| Expected output, exchange rate, or quoted-output telemetry | `quote.netAmountOut` |
| Edited output target | `quote.requestedOutAmount`; the eventual expected output can be higher |
| Minimum received, protection, or signed output limit | `quote.minimumAmountOut`, unchanged |
| Actual spent/received amounts after execution | `order.srcAmountFilled`, `order.dstAmountFilled`, and `order.fills` |
| Optional input/output/minimum USD display | Corresponding `inputAmountUsd`, `netAmountOutUsd`, or `minimumAmountOutUsd` |

Update card figures, confirmation, rates, price impact, swap summaries, and calibration/analytics consumers together. Do not replace the expected Receive amount with the protected minimum or report the old quote as the actual fill. USD totals and display numbers never determine executable raw amounts.

Retain any host minimum-spend policy at quote selection and before signing, including after `prepareSwap` refreshes the quote. Use a finite, nonnegative valuation of the actual input; a missing valuation is distinct from a confirmed value below the floor. Only reuse a debounced baseline's input valuation when its raw input or output target matches the current request. An output token's value does not establish the resolved input's value. Discover the host/service floor; do not hardcode another DEX's threshold.

## Compare routes on the same basis

Compare the same chain, token pair, account/recipient, amount direction, and slippage scope. A stale or mismatched baseline cannot establish the winner. Use exact raw-amount arithmetic and preserve the host's tie and rounding rules.

- **Exact input:** require the same fixed spend and compare Spot's `minimumAmountOut` with the DEX's protected output. If the host ranks by output after wallet-paid gas, subtract its valued gas from the DEX minimum using output-token units. Do not apply slippage to Spot's minimum a second time or subtract a legacy Hub gas field again.
- **Output target:** verify `requestedOutAmount` matches the edited target and `minimumAmountOut` covers it. Rank the resolved `request.inAmount` against the DEX's permitted input for that target. If the host includes wallet-paid gas, add its input-token equivalent to the DEX input cap. Funding caps must cover fractional-base-unit rounding. Do not rank a larger expected output while ignoring a larger fixed spend.
- **Missing price or baseline:** retain the host's explicit fallback policy. Unavailable gas valuation is not a measured zero, and a quote for a previous amount must not silently determine the new route.

UI amount-entry direction and execution trade type are distinct. An output-target quote executes as its server-resolved fixed input; the adapter can use the supported exact-input path after resolving and validating that spend. It does not add arbitrary exact-output execution or alternate-recipient support to `isSwapSupported`. Do not relabel a genuine exact-output order to bypass its support check.

Use one selected source for the displayed amounts, slippage, confirmation, and submit callback. Pin the reviewed venue and quote scope; do not run a legacy click-time "seek better price" path that silently switches the reviewed route. Treat a query as pending only when the current request is actually eligible and outstanding. Preserve distinct disabled/not-requested, no-offer, unavailable, loading, and retry states. Opening review reuses the selected quote; preparation owns the documented freshness check.

Bound quote attempts using the host's budget. Forward cancellation to the actual HTTP request through its `signal`; racing a running promise against a timer alone leaves obsolete work alive. Cancel or ignore results when account, chain, pair, amount, direction, recipient, or slippage changes, and freeze the final prepared review during signing.

## Keep prerequisite actions and recovery intact

If the existing UI exposes separate Wrap, Approve, and Swap actions, capture the clicked action before awaits. Wrap confirms wrapping and returns to review; Approve confirms approval and verifies allowance, then returns to review; only Swap prepares, signs, and submits. A shared executor must not turn every button into a complete swap.

Record submitted transaction hashes immediately and successful receipts before subsequent balance reads, UI callbacks, or scope checks can fail. Keep those facts through review dismissal. A confirmed wrap cannot be undone by aborting the local attempt. On retry, reread the wrapped balance and allowance, reuse the confirmed funds, and wrap only a verified remaining shortfall under the host's policy. Do not wrap the entire amount again because component state reset.

If the host offers Unwrap recovery, recheck the captured account/chain and current raw balance, confirm the transaction, and prevent it from spending funds committed to an accepted or uncertain order. Changing the amount may require a new shortfall calculation or an explicit unwind under the host's existing policy; a previous DEX's "unwrap first" rule is not universal.

Preserve existing signature checks, changing the legacy Permit2 target to `client.spenderAddress` and the captured chain. Recheck the prepared `signerAddress`, live wallet scope, balance, and allowance before signing/submission as required by the host. Submit the exact prepared payload and original signature.

## Transfer ownership from review to tracking

Persist the prepared payload and signature before POST and retain late acceptance even if the modal closes. Review cleanup can abort obsolete preparation/read work; it must not discard a submitted attempt or imply that aborting HTTP cancelled an order. Track accepted orders with the client for their captured chain/partner, independently of the wallet's current network. Each order owns one polling lifecycle and its own notification identity.

For uncertain acceptance, match the original protocol identity in configured account history. Verify the chain, maker, and exact signed payload/original signature when adopting a candidate; pair, amount, or timestamp alone is insufficient. An empty history page, missing lookup, offline state, timeout, or local deadline does not prove rejection. Keep the original attempt under the duplicate guard until uncertainty is resolved; moving it to a background collection is not permission to execute the same trade again.

Use order status to establish completion, actual fills for amounts, and real fill hashes for explorer links. Solver fill transactions must not enter a wallet transaction store that assumes the wallet owns the sender/nonce, or replacement detection can produce false cancellation notices. Keep wrap/approval receipt tracking in the existing wallet flow. Refresh balances on relevant fill/terminal events and deduplicate terminal notifications, including after reconnect, retry, or concurrent orders. Distinguish cancelled/expired outcomes with partial fills from an untouched trade.

## Verify the changed contracts

Migrate mocks and fixtures along with production code: `createClient` is asynchronous, quotes contain `request`, preparation supplies signing data, submission returns an `Order`, and tracking uses `getOrder`. Update signature-guard arguments and structured `QuoteError`/`SpotError` fixtures. Do not preserve old hash-based records, `signQuote`, `getTransactionDetails`, or generic error-string mocks merely to keep a legacy test green.

Use the host's existing checks for these observable behaviors:

- Host bps/percent conversion, auto/custom settings, and signed DEX slippage agree; no extra floor or pricing wait appears.
- Exact-input and output-target ranking uses the correct protected leg, gas units, tie/rounding policy, and matching baseline; target display and fixed spend remain distinct.
- Native input and native output retain their intended assets; shared chain/currency registries survive dependency removal.
- A disabled query is not an endless pending quote; old results cannot overwrite the selected review or reroute a submit.
- Wrap/Approve clicks stop after that action. Close/reopen after confirmation does not double-wrap, and insufficient confirmed allowance prevents signing.
- A prepared minimum decrease requires fresh review; a changed account/chain cannot sign or submit the captured attempt.
- Dismissing review during POST retains late acceptance. A lost response reconciles the exact original identity without duplicate execution.
- Accepted-but-open, delayed indexing, polling failure, and simultaneous orders on different chains stay trackable; actual fills drive final amounts and links without false wallet cancellation or duplicate notices.

Report actual commands and failures. Stale legacy tests are unfinished migration work, even when newer routing tests pass. Keep unavailable live wallet verification explicit; do not infer end-to-end success from mock coverage.

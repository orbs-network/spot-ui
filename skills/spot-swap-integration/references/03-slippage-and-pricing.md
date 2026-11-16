# Slippage and Pricing

Resolve automatic/custom policy in the host before quoting. Use the quote's resulting percentage for review; the SDK quote minimum already includes the requested tolerance.

Read a token's USD unit price with standalone
`getTokenUsd({ tokenAddress, chainId, signal })`. It needs no client or
configuration load. Supply the active chain explicitly; `signal` is optional.
Prices always use the default production service, independently of client
`apiUrl` or the web demo's `devApi` flag. The function accepts no endpoint option
and does not infer configuration from browser or environment settings.
The decimal string is USD per whole token, normalized from the service's
18-decimal raw price, independently of token decimals. Use decimal arithmetic
when multiplying by input units; do not use the rounded display price.
Each call sends its own fresh price request, and `signal` cancels that request.
`getTokenUsd` throws for failed or malformed responses; the host owns fallback
policy for those calls.

Resolve any required unit price in the DEX and compute the total USD value with
decimal arithmetic. Pass that total to the synchronous standalone policy before
displaying slippage or requesting a quote. For a positive automatic input:

```ts
import BN from "bignumber.js";
import { getTokenUsd, getSwapSlippage } from "@orbs-network/spot-ui";

// Apply the host's timeout, cancellation, and fallback policy to the price read.
const unitPriceUsd = isUserCustomSlippage
  ? undefined
  : await getTokenUsd({ tokenAddress: inToken, chainId, signal }).catch(() => undefined);
signal?.throwIfAborted();
const amountUsd = unitPriceUsd === undefined
  ? undefined
  : new BN(inputAmountRaw).shiftedBy(-inputTokenDecimals).times(unitPriceUsd).toFixed();
const slippagePercent = isUserCustomSlippage
  ? dexSlippage
  : getSwapSlippage({ amountUsd, slippage: dexSlippage }).slippagePercent;
const quote = await client.getQuote({
  inToken, outToken, inAmount: inputAmountRaw, user: account,
  slippage: slippagePercent, signal,
});
```

`amountUsd` is a total USD decimal string or `undefined`, never a unit price or
promise. Convert raw token units with their decimals using `BN`, without passing
spending amounts through JavaScript `Number`. For an output target, apply the
same calculation to the typed output-token raw amount, decimals, and unit price.
The helper takes only `{ amountUsd, slippage }`; it performs no fetching,
caching, timers, or asynchronous work. Quote amounts remain integer base units.

The helper's `slippage` is required. It must round to at least one basis
point and must not exceed 50%; zero is rejected. Automatic mode uses the DEX
baseline with a 1% floor for positive totals worth at most $100, without lowering
a higher baseline. Larger totals retain the baseline. The host selects custom
mode itself, validates the chosen percentage under its quote settings, and
passes it directly to the quote without calling the automatic helper or reading
USD prices. Normalize an empty or zero automatic
setting to the positive DEX default first.
Missing, invalid, or nonpositive USD totals retain the baseline with undefined
`amountUsd`. Invalid helper slippage throws `INVALID_ARGUMENT`.
The frozen result contains `slippagePercent`, integer `slippageBps`, and optional
`amountUsd` for the positive total used by automatic policy. Quote
`inputAmountUsd` remains separate from the helper's total USD argument.

The web demo owns a 1,500 ms wait for automatic quote pricing and passes
`undefined` after a lookup failure or timeout, while caller cancellation propagates.
A per-request controller cancels the price request on timeout. Only positive
automatic quote amounts request pricing; the DEX custom branch skips both price
reads and the helper.
Other hosts choose their loading, timeout, cancellation, and fallback policy.
After quoting, the displayed percentage comes from
`quote.request.slippage`, then `prepared.quote.request.slippage` at signing.
Never recompute a different display value from settings beside the accepted quote.
For output entry, the web demo classifies automatic slippage once using the target
output token and its approximate USD value. The price helper's contract is unchanged.

For request identity, minimum protection, and preparation freshness, read [Swap flow](02-swap-flow.md). Quotes always keep executable values in integer base units; USD valuation is separate host policy and display data.

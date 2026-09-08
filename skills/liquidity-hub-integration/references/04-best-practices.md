# Best Practices

## Quote Handling

- **Fetch in parallel** — Always fetch the LH quote alongside the DEX quote, never sequentially. The user should not wait longer than they would for a normal swap.
- **Debounce** — Debounce quote requests when the user is typing an amount (300ms recommended, exported as `FROM_AMOUNT_DEBOUNCE`).
- **Abort stale quotes** — Use `AbortController` to cancel in-flight quote requests when inputs change:
  ```ts
  const controller = new AbortController();
  const quote = await lh.getQuote({ ...args, signal: controller.signal });
  // On input change: controller.abort();
  ```
- **Check freshness** — Before executing a swap, verify the quote isn't stale:
  ```ts
  import { isFreshQuote } from "@orbs-network/liquidity-hub-sdk";
  if (!isFreshQuote(quote)) {
    /* re-fetch */
  }
  ```
- **Refetch periodically** — Quotes are valid for ~60 seconds. Refetch every 10 seconds (`DEFAULT_QUOTE_INTERVAL`) while the user is on the swap page.

## Price Comparison

- **Use `minAmountOut`** — This is the correct field for comparison against the DEX's `dexMinAmountOut`.
- **Don't use `outAmount`** — `outAmount` is the raw output before slippage adjustments.
- **Fall back gracefully** — If the LH quote fails or returns an error, silently fall back to the DEX swap. Never block the user.

## Native Tokens

Liquidity Hub only works with ERC-20 tokens. If the source token is a native token (ETH, BNB, MATIC, etc.):

1. Check with `isNativeAddress` from the SDK.
2. Wrap to the chain's wrapped token (WETH, WBNB, WPOL, etc.) before approval/signing.
3. Use the wrapped token address as `fromToken` in the quote.

```ts
import { isNativeAddress } from "@orbs-network/liquidity-hub-sdk";

const isNative = isNativeAddress(fromToken);
```

## Error Handling

- **Quote errors** — Catch and fall back to DEX swap silently. Common errors:
  - `"no liquidity"` — No solver has liquidity for this pair
  - `"tns"` — Token not supported
  - `"ldv"` — Low dollar value (amount too small)
  - `"timeout"` — Quote request timed out
- **Pre-submission swap errors** — Before an LH transaction hash exists, show the error and allow the normal DEX route.
- **Post-submission errors** — Once `swap()` returns a hash, never submit a fallback swap. Retry receipt lookup for that hash and surface pending/reverted state through the DEX's existing transaction UI.
- **No mutation retries** — Do not automatically retry wrapping, approval, signing, or LH submission.

## SDK Lifecycle

- **One instance per chain** — Memoize the SDK instance and replace it when the
  chain changes:
  ```ts
  const liquidityHub = useMemo(
    () => createClient({ chainId, partner: "mydex" }),
    [chainId],
  );
  ```
- **Don't create per-swap** — Reuse the instance across swaps on the same chain. The SDK tracks session state internally.

## Debugging

Enable debug logging by setting `lhDebug` in localStorage:

```ts
localStorage.setItem("lhDebug", "true");
```

When browser CORS blocks local development, configure a same-origin proxy
explicitly on the SDK client:

```ts
const liquidityHub = createClient({
  chainId,
  partner: "mydex",
  apiUrl:
    process.env.NODE_ENV === "development"
      ? "/api/liquidity-hub"
      : undefined,
});
```

The server proxy must be development-only and must allowlist both the upstream
Liquidity Hub hosts and the `quote`, `swap-async`, and `swap/status/:sessionId`
paths. Never expose a caller-controlled upstream URL or an unrestricted relay.

## Checklist

- [ ] Partner name set to DEX name (lowercase)
- [ ] `@orbs-network/liquidity-hub-sdk` installed
- [ ] SDK initialized with correct `chainId` and `partner`
- [ ] LH quote fetched in parallel with DEX quote
- [ ] Price comparison uses `minAmountOut` vs `dexMinAmountOut`
- [ ] Native tokens wrapped before swap
- [ ] Permit2 approval checked and requested when needed
- [ ] EIP-712 signature obtained from user
- [ ] Quote freshness checked before swap execution
- [ ] LH transaction confirmed with the DEX's `waitForTransactionReceipt`
- [ ] Reverted receipt handled as a failure
- [ ] No DEX fallback submitted after an LH transaction hash exists
- [ ] Wallet and swap mutations are not automatically retried
- [ ] All analytics callbacks reported (quote, wrap, approval, signature, swap, dexSwap)
- [ ] Graceful DEX fallback only before an LH transaction hash exists
- [ ] Debounce on quote requests
- [ ] AbortController used for stale quotes

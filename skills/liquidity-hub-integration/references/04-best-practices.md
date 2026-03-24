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
  if (!isFreshQuote(quote)) { /* re-fetch */ }
  ```
- **Refetch periodically** — Quotes are valid for ~60 seconds. Refetch every 10 seconds (`DEFAULT_QUOTE_INTERVAL`) while the user is on the swap page.

## Price Comparison

- **Use `minAmountOut`** — This is the correct field for comparison against the DEX's `dexMinAmountOut`.
- **Don't use `outAmount`** — `outAmount` is the raw output before slippage adjustments.
- **Fall back gracefully** — If the LH quote fails or returns an error, silently fall back to the DEX swap. Never block the user.

## Native Tokens

Liquidity Hub only works with ERC-20 tokens. If the source token is a native token (ETH, BNB, MATIC, etc.):

1. Check with `nativeTokenAddresses` from the SDK.
2. Wrap to the chain's wrapped token (WETH, WBNB, WPOL, etc.) before approval/signing.
3. Use the wrapped token address as `fromToken` in the quote.

```ts
import { nativeTokenAddresses } from "@orbs-network/liquidity-hub-sdk";

const isNative = nativeTokenAddresses.some(
  (addr) => addr.toLowerCase() === fromToken.toLowerCase()
);
```

## Error Handling

- **Quote errors** — Catch and fall back to DEX swap silently. Common errors:
  - `"no liquidity"` — No solver has liquidity for this pair
  - `"tns"` — Token not supported
  - `"ldv"` — Low dollar value (amount too small)
  - `"timeout"` — Quote request timed out
- **Swap errors** — Show error to user, offer to retry or fall back to DEX.
- **Never block the swap** — Liquidity Hub is an optimization. If anything fails, the user should still be able to swap through the DEX router.

## SDK Lifecycle

- **One instance per chain** — Create a new SDK instance when the chain changes:
  ```ts
  useEffect(() => {
    lhRef.current = constructSDK({ chainId, partner: "myDex" });
  }, [chainId]);
  ```
- **Don't create per-swap** — Reuse the instance across swaps on the same chain. The SDK tracks session state internally.

## Debugging

Enable debug logging by setting `lhDebug` in localStorage:
```ts
localStorage.setItem("lhDebug", "true");
```

Override the API URL for testing:
```ts
localStorage.setItem("lhOverrideApiUrl", "https://custom-api-url.com");
```

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
- [ ] All analytics callbacks reported (quote, wrap, approval, signature, swap, dexSwap)
- [ ] Graceful fallback to DEX on any LH failure
- [ ] Debounce on quote requests
- [ ] AbortController used for stale quotes

# `@orbs-network/liquidity-hub-sdk`

`@orbs-network/liquidity-hub-sdk` lets a DEX request quotes from Orbs Liquidity Hub and execute a swap when Liquidity Hub offers a better result than the DEX's own router.

Liquidity Hub is an optimization layer, not a replacement for the DEX route. Keep the existing DEX swap available whenever Liquidity Hub is unavailable or does not offer the better minimum output.

## React integration

This integration uses TanStack Query v5 and exactly two source files: one framework-independent TypeScript module and one React module.

### Install

```bash
npm install @orbs-network/liquidity-hub-sdk @tanstack/react-query
```

The SDK works with any wallet stack, including wagmi, viem, and ethers.

### Add the two files

Copy these files into the same directory in the React application:

| File                                                                | Responsibility                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`liquidity-hub.ts`](examples/react/liquidity-hub.ts)               | SDK creation, query keys, shared types, route comparison, Permit2 approval flow, EIP-712 signing, swap execution, and analytics |
| [`liquidity-hub-react.tsx`](examples/react/liquidity-hub-react.tsx) | `QueryClientProvider`, the `useQuery` quote hook, and the `useMutation` swap hook                                               |

Change `LIQUIDITY_HUB_PARTNER` in `liquidity-hub.ts` to the DEX's stable lowercase partner name.

In Next.js App Router, keep `liquidity-hub-react.tsx` behind its existing `"use client"` boundary. `liquidity-hub.ts` stays React-free and can be tested independently.

### Connect the provider

Wrap the application once with `LiquidityHubQueryProvider`. If the application already has a `QueryClientProvider`, keep the existing provider and do not add a second one.

### Fetch and compare quotes

Call `useLiquidityHubQuote` from the existing swap form. Pass integer amounts in token base units, not display-formatted values.

| Parameter         | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `chainId`         | Active EVM chain ID                                             |
| `account`         | Connected wallet address                                        |
| `fromToken`       | ERC-20 source address; use the wrapped address for native input |
| `toToken`         | Destination token address                                       |
| `inAmount`        | Input amount as an integer string in base units                 |
| `dexMinAmountOut` | Existing DEX route's minimum output in base units               |
| `slippage`        | Percentage, for example `0.5` for 0.5%                          |
| `disabled`        | Optional flag that pauses the query                             |

The hook:

- keeps all quote inputs in a serializable query key;
- passes TanStack Query's abort signal to `sdk.getQuote`;
- polls every 10 seconds and removes unused quote entries after 60 seconds;
- retries transient failures twice but does not retry unsupported-token, no-liquidity, or low-value responses;
- exposes `getLatestQuote()` for the mutation to force a fresh quote before signing.

Debounce the typed input amount before passing it to the hook. The SDK exports `FROM_AMOUNT_DEBOUNCE` as the recommended 300 ms delay.

Use the SDK's `isLiquidityHubBetter(quote, dexMinAmountOut)` helper to select
the route. It compares `quote.minAmountOut` with the DEX minimum as base-unit
integers and safely rejects malformed values. Do not compare `quote.outAmount`
or formatted decimal strings.

### Execute with the mutation

Create `useLiquidityHubSwap` with the SDK and `getLatestQuote` returned by the quote hook, plus a `WalletAdapter` implemented with the application's wallet library.

The adapter must provide:

- `getAllowance` and `approve` for Permit2;
- `wrapNative` when native input is supported;
- `signQuote` for the quote's wallet-ready `eip712` payload;
- `waitForTransactionReceipt` using the DEX's wallet or RPC client.

Use the SDK's `isNativeAddress(address)` helper when deciding whether the host
must wrap the input token; it handles every supported native-token alias
case-insensitively.

Call the mutation's `mutateAsync` with the accepted quote, account, DEX minimum output, whether the original source was native, and optional DEX router calldata.

The mutation runs the following flow:

1. Wrap native input when required.
2. Check and approve the Permit2 allowance.
3. Force a fresh Liquidity Hub quote.
4. Confirm the inputs are unchanged and Liquidity Hub still beats the DEX minimum.
5. Sign the fresh EIP-712 quote.
6. Recheck freshness and submit it with `sdk.swap`.
7. Wait for the transaction receipt through the host wallet stack.

The mutation has no automatic retries because repeating a wallet mutation can repeat signatures or transactions. Its shared mutation scope serializes swap attempts; also disable the submit button while `isPending` is true.

The SDK also rejects a stale quote and prevents a second swap from starting on
the same client while one is active. These action-boundary checks protect
framework-neutral integrations that do not use the bundled React mutation.

If `mutateAsync` rejects, continue through the existing DEX route. If native wrapping already completed, route the wrapped token or unwrap it before falling back.

`sdk.swap` resolves when the transaction hash is available; it does not wait
for on-chain confirmation. The host DEX owns receipt tracking through its
existing `waitForTransactionReceipt` implementation.

### Local development proxy

If the Liquidity Hub host does not accept the browser's CORS preflight, route
requests through a same-origin development proxy and pass its base path when
creating the SDK:

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

The `apiUrl` applies to quote, swap submission, and swap-status requests.
Keep the server route development-only, use fixed upstream hosts, and allow
only the Liquidity Hub endpoints instead of exposing an unrestricted proxy.

### Analytics

`getQuote` and `swap` report their own request and failure events. The two-file integration also reports wrap, approval, signature, and swap-success callbacks.

Analytics and quote-session state are isolated per SDK client. Reuse one client
for a partner and chain, and create a new one when either value changes. Quote
timeouts abort the underlying HTTP request, and caller cancellation remains an
abort rather than being rewritten as a normal quote failure. Signatures are
never written to debug logs or analytics payloads.

When the DEX route wins, report the completed DEX transaction through `sdk.analytics.dexSwap` with the panel, router, token addresses, input amount, and transaction hash.

## Integration checklist

- Only `liquidity-hub.ts` and `liquidity-hub-react.tsx` are added to the application.
- The app has one `QueryClientProvider` and one SDK client for the active chain.
- Native source assets use their wrapped address for quotes.
- Quote and DEX minimum outputs are compared as base-unit integers.
- A fresh quote is fetched immediately before signing.
- Permit2 approval and EIP-712 signing use the connected account.
- Transaction confirmation uses the host DEX's receipt client.
- The swap mutation is not retried and duplicate submissions are disabled.
- Liquidity Hub errors fall back to the existing DEX route.

For supported networks and additional details, see the [official React DEX integration guide](https://docs.orbs.network/orbs-integrations/liquidity-hub-sdk/integrating-liquidity-hub-with-your-dex) and the repository's [`liquidity-hub-integration`](https://github.com/orbs-network/spot-ui/tree/master/skills/liquidity-hub-integration) guide.

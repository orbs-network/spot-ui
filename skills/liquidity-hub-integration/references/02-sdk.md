# SDK Reference

## Initialization

Create one SDK instance per chain. Re-create when the chain changes.

```ts
import { constructSDK } from "@orbs-network/liquidity-hub-sdk";

const lh = constructSDK({
  chainId: 137, // Required: chain ID
  partner: "mydex", // Required: your stable DEX identifier
  apiUrl: "/api/liquidity-hub", // Optional: custom API or same-origin proxy
  blockAnalytics: false, // Optional: disable analytics (default: false)
});
```

`apiUrl` may be absolute or relative. Use a relative URL for a same-origin
local development proxy; omit it in production to use the chain's standard
Liquidity Hub endpoint.

## Types

```ts
interface QuoteArgs {
  fromToken: string; // Source token address
  toToken: string; // Destination token address
  inAmount: string; // Source amount in token base units (integer string)
  dexMinAmountOut?: string; // DEX router's min output (for comparison)
  account?: string; // User's wallet address
  slippage: number; // Slippage tolerance (e.g. 0.5 for 0.5%)
  signal?: AbortSignal; // Optional: cancel the request
  timeout?: number; // Optional: override default 10s timeout, in milliseconds
  inAmountUsd?: number; // Optional: input amount in USD (for analytics)
}

interface Quote {
  inToken: string;
  outToken: string;
  inAmount: string;
  outAmount: string; // Total output amount in wei
  userMinOutAmountWithGas: string;
  outAmountWS: string; // Output amount with slippage
  user: string;
  slippage: number;
  sessionId: string;
  serializedOrder: string;
  permitData: QuotePermitData; // Typed framework-neutral EIP-712 data
  eip712?: unknown; // Legacy backend metadata
  minAmountOut: string;
  gasAmountOut?: string;
  referencePrice?: string;
  timestamp: number;
}
```

## Fetching a Quote

```ts
try {
  const quote = await lh.getQuote({
    fromToken: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
    toToken: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH on Polygon
    inAmount: "1000000000", // 1000 USDC (6 decimals)
    dexMinAmountOut: dexQuoteOutput, // From your DEX router
    account: userAddress,
    slippage: 0.5,
  });
} catch (error) {
  // Quote failed — fall back to DEX swap
}
```

## Price Comparison

Compare `quote.minAmountOut` against the DEX router's min output (`dexMinAmountOut`). Use whichever is higher:

```ts
import { isLiquidityHubBetter } from "@orbs-network/liquidity-hub-sdk";

if (isLiquidityHubBetter(quote, dexMinAmountOut)) {
  // Liquidity Hub wins — execute through LH
} else {
  // DEX wins — execute normal DEX swap
  // Report to analytics:
  lh.analytics.dexSwap({
    panel: "main",
    router: "your-router-name",
    srcTokenAddress: fromToken,
    dstTokenAddress: toToken,
    inAmount: inputAmount,
    txHash: dexTxHash,
  });
}
```

## Swap Execution

After the user signs the quote:

```ts
const txHash = await lh.swap(quote, signature, dexRouterData);
```

- `quote` — the Quote object from `getQuote`
- `signature` — EIP-712 signature string from the user
- `dexRouterData` — optional `{ data, to }` from the DEX router (for fallback)

Returns a transaction hash string.

`swap` rejects stale quotes and concurrent submissions made through the same
SDK client. It accepts a transaction hash returned directly by submission or
polls the status endpoint when processing is asynchronous.

## Transaction Confirmation

The SDK returns the transaction hash. Confirm it through the DEX's existing
wallet or RPC client:

```ts
const receipt = await publicClient.waitForTransactionReceipt({
  hash: txHash as `0x${string}`,
});

if (receipt.status !== "success") {
  throw new Error("Liquidity Hub transaction reverted");
}
```

Liquidity Hub does not provide a second transaction-details polling API. The
DEX remains responsible for receipt handling, confirmations, replacements,
and reverts.

Call `lh.analytics.swap.onSuccess()` only after a successful receipt. If
receipt confirmation fails after a transaction hash was returned, do not
submit the DEX fallback—the LH transaction may already be pending or mined.

## Quote Freshness

Before executing a swap, verify the quote isn't stale:

```ts
import { isFreshQuote } from "@orbs-network/liquidity-hub-sdk";

if (!isFreshQuote(quote, 60)) {
  // Quote is older than 60 seconds — fetch a new one
}
```

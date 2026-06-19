# @orbs-network/spot-react

React SDK for building TWAP, Limit, Stop-Loss, and Take-Profit order interfaces on top of the [Orbs Spot protocol](https://www.orbs.com/).

## Installation

```bash
npm install @orbs-network/spot-react
```

### Peer Dependencies

These must be installed in your application:

```bash
npm install @tanstack/react-query bignumber.js react-error-boundary zustand react react-dom
```

| Package                | Version    |
| ---------------------- | ---------- |
| `@tanstack/react-query`| `^5.90.12` |
| `bignumber.js`         | `^9.3.1`   |
| `react-error-boundary` | `^6.0.0`   |
| `zustand`              | `^5.0.9`   |
| `react`                | `^18 \|\| ^19` |
| `react-dom`            | `^18 \|\| ^19` |

## Quick Start

```tsx
import {
  SpotProvider,
  useSpot,
  Module,
  Partners,
  type WalletInteractions,
} from "@orbs-network/spot-react";

function App() {
  return (
    <SpotProvider
      chainId={137}                              // Polygon
      walletInteractions={walletInteractions}    // Wallet interaction handlers
      account={walletAddress}                    // Connected wallet address
      appId="my-dex"                             // Optional analytics app ID
      partner={Partners.Quick}                   // DEX partner
      module={Module.TWAP}                       // Order type
      typedInputAmount={inputAmount}             // User-typed amount (string)
      priceProtection={0.5}                      // Slippage tolerance %
      minChunkSizeUsd={5}                        // Min chunk size in USD
      srcToken={srcToken}                        // { address, symbol, decimals, logoUrl }
      dstToken={dstToken}
      srcBalance={srcBalanceWei}                 // Balance in wei (string)
      dstBalance={dstBalanceWei}
      srcUsd1Token={srcUsdPrice}                 // USD price of 1 token (string)
      dstUsd1Token={dstUsdPrice}
      marketReferencePrice={marketPrice}         // { value?: string, isLoading?: boolean }
      callbacks={callbacks}                      // Lifecycle event handlers
      fees={0.25}                                // Fee percentage
    >
      <SwapForm />
    </SpotProvider>
  );
}
```

## WalletInteractions

The host app provides wallet interaction handlers via the `walletInteractions` prop. This keeps spot-react wallet-agnostic — it works with viem, ethers, web3.js, or any wallet library.

```tsx
const walletInteractions: WalletInteractions = {
  // Wrap native token (e.g. ETH -> WETH). Wait for receipt, return tx hash.
  wrapNativeToken: async (amountWei) => { ... },

  // Approve ERC-20 token spending. Wait for receipt, return tx hash.
  approveToken: async ({ token, amount, spender }) => { ... },

  // Cancel an order on-chain. Wait for receipt, return tx hash.
  cancelOrder: async ({ order, contractAddress, args }) => { ... },

  // Sign EIP-712 typed data for order creation. Return signature hex.
  signOrder: async ({ domain, types, primaryType, message, account }) => { ... },

  // Read ERC-20 allowance. Return allowance as string.
  getAllowance: async ({ tokenAddress, spenderAddress }) => { ... },
};
```

Each write method (`wrapNativeToken`, `approveToken`, `cancelOrder`) should wait for tx confirmation and throw if the transaction reverts.

### Example with viem/wagmi

```tsx
import { erc20Abi } from "viem";

const walletInteractions: WalletInteractions = {
  wrapNativeToken: async (amountWei) => {
    const hash = await walletClient.writeContract({
      abi: [{ name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] }],
      functionName: "deposit",
      address: wTokenAddress,
      args: [],
      value: BigInt(amountWei),
      chain: walletClient.chain,
      account: walletClient.account!,
    });
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
    return hash;
  },
  approveToken: async ({ token, spender }) => {
    const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    const hash = await walletClient.writeContract({
      abi: erc20Abi,
      functionName: "approve",
      address: token as `0x${string}`,
      args: [spender as `0x${string}`, maxUint256],
      chain: walletClient.chain,
      account: walletClient.account!,
    });
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
    return hash;
  },
  cancelOrder: async ({ order, contractAddress, args }) => {
    const hash = await walletClient.writeContract({
      abi: cancelAbi, // TWAP_ABI for v1, REPERMIT_ABI for v2
      functionName: "cancel",
      address: contractAddress as `0x${string}`,
      args: args as any,
      chain: walletClient.chain,
      account: walletClient.account!,
    });
    await publicClient.waitForTransactionReceipt({ hash, confirmations: 2 });
    return hash;
  },
  signOrder: async ({ domain, types, primaryType, message, account }) => {
    return walletClient.signTypedData({ domain, types, primaryType, message, account });
  },
  getAllowance: async ({ tokenAddress, spenderAddress }) => {
    const result = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "allowance",
      args: [walletClient.account!.address, spenderAddress as `0x${string}`],
    });
    return String(result);
  },
};
```

## SpotProvider Props

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `partner` | `Partners` | Yes | DEX partner enum |
| `module` | `Module` | Yes | `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT` |
| `typedInputAmount` | `string` | Yes | User-typed source amount |
| `priceProtection` | `number` | Yes | Slippage tolerance percentage |
| `minChunkSizeUsd` | `number` | Yes | Minimum trade chunk size in USD |
| `marketReferencePrice` | `MarketReferencePrice` | Yes | `{ value?: string, isLoading?: boolean, noLiquidity?: boolean }` |
| `walletInteractions` | `WalletInteractions` | Yes | Wallet interaction handlers |
| `chainId` | `number` | No | Connected chain ID |
| `account` | `string` | No | Connected wallet address |
| `appId` | `string` | No | Analytics app ID |
| `srcToken` | `Token` | No | `{ address, symbol, decimals, logoUrl }` |
| `dstToken` | `Token` | No | `{ address, symbol, decimals, logoUrl }` |
| `srcBalance` | `string` | No | Source balance in wei |
| `dstBalance` | `string` | No | Destination balance in wei |
| `srcUsd1Token` | `string` | No | USD price of 1 source token |
| `dstUsd1Token` | `string` | No | USD price of 1 destination token |
| `callbacks` | `Callbacks` | No | Lifecycle event handlers |
| `fees` | `number` | No | Fee percentage (e.g. 0.25) |
| `isDev` | `boolean` | No | Enable dev mode |
| `overrides` | `Overrides` | No | Initial state overrides |

## useSpot() Hook

The main hook returns all data and controls for building the UI:

```tsx
const spot = useSpot();
```

### Returned panels

| Panel | Description |
| --- | --- |
| `spot.dstTokenPanel` | `{ value, isLoading }` — estimated output amount |
| `spot.tradesAmountPanel` | Total trades input, per-trade amounts, validation |
| `spot.durationPanel` | Order expiry duration input |
| `spot.fillDelayPanel` | Trade interval input |
| `spot.limitPricePanel` | Limit price input with percentage, toggle, reset |
| `spot.triggerPricePanel` | Trigger price for stop-loss / take-profit |
| `spot.pricePanel` | Market price display, inversion toggle |
| `spot.disclaimerPanel` | Disclaimer key string (or `undefined`) |
| `spot.inputError` | Validation error `{ type, args }` (or `undefined`) |
| `spot.submitOrderButton` | `{ disabled, loading }` |
| `spot.orderExecutionPanel` | Full submission lifecycle (see below) |
| `spot.orderHistoryPanel` | `{ orders: { all: Order[] } }` |
| `spot.derivedFormData` | Computed values: amounts, prices, deadline, fees |
| `spot.supportedChains` | Partner's supported chain IDs |
| `spot.module` | Current `Module` enum |

### Order Execution Panel

```tsx
const {
  onSubmit,              // Trigger order creation
  status,                // SwapStatus: LOADING | SUCCESS | FAILED
  step,                  // Current step: WRAP | APPROVE | CREATE
  stepIndex,             // Current step index (0-based)
  totalSteps,            // Total number of steps
  parsedError,           // { code, message } on failure
  onSwapSuccess,         // Call when user acknowledges success
  confirmButtonLoading,  // Loading state for confirm button
  srcToken,              // Resolved source token
  dstToken,              // Resolved destination token
  wrapTxHash,            // Wrap transaction hash
  approveTxHash,         // Approve transaction hash
} = useSpot().orderExecutionPanel;
```

### Cancel Order

```tsx
import { useCancelOrder } from "@orbs-network/spot-react";

// Inside a component rendered within SpotProvider:
const { cancelOrder, isLoading, isSuccess, isError, error, txHash } = useCancelOrder(order);

// Cancel the order
await cancelOrder();

// Or use getCancelStatus for any order by ID:
const { getCancelStatus } = useCancelOrder();
const status = getCancelStatus(orderId); // { status, txHash?, error? } | undefined
```

## Callbacks

Pass lifecycle callbacks to `SpotProvider` for wallet notifications:

```tsx
const callbacks: Callbacks = {
  // Token wrapping
  onWrapRequest: () => {},
  onWrapSuccess: ({ txHash, explorerUrl, amount }) => {},

  // Token approval
  onApproveRequest: () => {},
  onApproveSuccess: ({ txHash, explorerUrl, token, amount }) => {},

  // Order lifecycle
  onSignOrderRequest: () => {},
  onSignOrderSuccess: (signature) => {},
  onSignOrderError: (error) => {},
  onOrderCreated: (order) => {},
  onOrderFilled: (order) => {},

  // Errors
  onSubmitOrderFailed: ({ code, message }) => {},
  onSubmitOrderRejected: () => {},

  // Order cancellation
  onCancelOrderRequest: (order) => {},
  onCancelOrderSuccess: ({ order, txHash, explorerUrl }) => {},
  onCancelOrderFailed: (error) => {},

  // Progress (good place to refetch balances)
  onOrdersProgressUpdate: (orders) => {},

  // Clipboard
  onCopy: () => {},

  // State change callbacks
  onLimitPriceChange: (price) => {},
  onTriggerPriceChange: (price) => {},
  onDurationChange: (duration) => {},
  onFillDelayChange: (fillDelay) => {},
  onChunksChange: (chunks) => {},
};
```

## Translations / i18n

The SDK returns string keys for user-facing messages. You should resolve these through your own i18n system.

### Disclaimer keys

`useSpot().disclaimerPanel` returns one of:
- `"limitOrderDisclaimer"` — shown for limit and TWAP-limit orders
- `"marketOrderDisclaimer"` — shown for market orders
- `"triggerMarketPriceDisclaimer"` — shown for stop-loss at market price

### Input error keys

`useSpot().inputError` returns `{ type, args }` where `type` is a key like:
- `"enterAmount"`, `"insufficientFunds"`, `"emptyLimitPrice"`, `"emptyTriggerPrice"`
- `"maxChunksError"` (args: `{ maxChunks }`)
- `"minChunksError"` (args: `{ minChunks }`)
- `"minTradeSizeError"` (args: `{ minTradeSize }`)
- `"minDurationError"` / `"maxDurationError"` (args: `{ duration }`)
- `"minFillDelayError"` / `"maxFillDelayError"` (args: `{ fillDelay }`)
- `"noLiquidity"`

## Order Types

| Module | Description |
| --- | --- |
| `Module.TWAP` | Time-Weighted Average Price — splits order into multiple trades over time |
| `Module.LIMIT` | Limit order — executes at specified price or better |
| `Module.STOP_LOSS` | Stop-loss — triggers when price drops to threshold |
| `Module.TAKE_PROFIT` | Take-profit — triggers when price rises to threshold |

### Panel visibility by module

| Panel | TWAP | LIMIT | STOP_LOSS | TAKE_PROFIT |
| --- | --- | --- | --- | --- |
| Trades amount | Yes | — | — | — |
| Fill delay | Yes | — | — | — |
| Duration | — | Yes | Yes | Yes |
| Limit price | Yes | Yes | Yes | Yes |
| Trigger price | — | — | Yes | Yes |

## Helper Hooks

```tsx
import {
  useExplorerLink,  // (txHash?: string) => explorer URL
  useNetwork,       // () => network info (name, native, wToken, explorer)
  useAmountUi,      // (amount: string, decimals: number) => formatted amount
} from "@orbs-network/spot-react";
```

## Utility Functions

```tsx
import {
  getPartners,           // () => all registered partners
  getPartnerChains,      // (partner) => supported chain IDs
  getNetwork,            // (chainId) => network config
  isNativeAddress,       // (address) => boolean
  eqIgnoreCase,          // (a, b) => case-insensitive address comparison
  getConfig,             // (partner, chainId) => SpotConfig
} from "@orbs-network/spot-react";
```

## Overrides

For initial form state, pass `overrides` to `SpotProvider`:

```tsx
<SpotProvider
  overrides={{
    state: {
      isMarketOrder: false,
      chunks: 10,
      limitPrice: "1.5",
      triggerPrice: "1.2",
      fillDelay: { value: 5, unit: TimeUnit.Minutes },
      duration: { value: 1, unit: TimeUnit.Days },
    },
  }}
  // ...other props
/>
```

## Constants

```tsx
import {
  SPOT_VERSION,       // SDK version identifier
  DISCLAIMER_URL,     // Orbs disclaimer page
  ORBS_TWAP_FAQ_URL,  // TWAP FAQ page
  ORBS_SLTP_FAQ_URL,  // Stop-Loss/Take-Profit FAQ page
  ORBS_LOGO,          // Orbs logo URL
  ORBS_WEBSITE_URL,   // Orbs website
  networks,           // All supported network configs
} from "@orbs-network/spot-react";
```

## License

MIT

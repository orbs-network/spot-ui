# @orbs-network/spot-react

React SDK for building TWAP, Limit, Stop-Loss, and Take-Profit order interfaces on top of the [Orbs Spot protocol](https://www.orbs.com/).

`spot-react` owns Spot order state and exposes it through `SpotProvider` and `useSpot()`. The host DEX remains responsible for swap-form state, wallet access, components, styling, translations, routing, and modal shells.

For the complete integration workflow, see the [Spot React integration skill](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-react-integration) and the [reference implementation](https://github.com/orbs-network/spot-ui/blob/master/apps/web/components/spot/spot-form.tsx).

## Before You Start

Every DEX needs an Orbs Spot configuration with a partner name, adapter address, and supported chains. If the DEX does not already have a configuration or a member of the exported `Partners` enum, contact [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup) before integrating.

The completed integration should:

- keep tokens, typed amount, balances, USD prices, and quote state in the DEX's existing swap store or context;
- provide all five `walletInteractions` methods using the DEX's existing wallet stack;
- render TWAP, Limit, Stop-Loss, and Take-Profit entry points using DEX-native navigation and components;
- use `@orbs-network/swap-ui` for the order review/progress flow inside the DEX's modal shell;
- render order history and cancellation inside `SpotProvider` scope or through a context-preserving portal.

## Installation

Install the latest Spot packages with the host application's package manager. Do not mix lockfiles.

```bash
npm install @orbs-network/spot-react@latest @orbs-network/swap-ui@latest
# or: pnpm add @orbs-network/spot-react@latest @orbs-network/swap-ui@latest
# or: yarn add @orbs-network/spot-react@latest @orbs-network/swap-ui@latest
```

If migrating from `@orbs-network/twap-ui`, remove it before installing the packages above.

### Peer Dependencies

The host application must also provide:

```bash
npm install @tanstack/react-query bignumber.js react-error-boundary zustand react react-dom
```

| Package | Version |
| --- | --- |
| `@tanstack/react-query` | `^5.90.12` |
| `bignumber.js` | `^9.3.1` |
| `react-error-boundary` | `^6.0.0` |
| `zustand` | `^5.0.9` |
| `react` | `^18 \|\| ^19` |
| `react-dom` | `^18 \|\| ^19` |

`viem` is not a dependency. Adapt the wallet library already used by the DEX through `walletInteractions`.

## Integration Model

Keep the DEX swap form as the source of truth. Pass the following adapted values directly to `SpotProvider`:

| Value | Expected shape |
| --- | --- |
| Selected tokens | `Token` objects with `address`, `symbol`, `decimals`, and `logoUrl` |
| Typed source amount | User-facing decimal string, for example `"1.25"` |
| Quote output | Raw destination-token amount for the current typed input |
| Balances | Raw integer strings |
| USD prices | USD value of exactly one whole source/destination token |
| Chain and account | Values from the connected wallet/account state |

If several Spot components need the same DEX-owned values, expose a small DEX adapter context. Do not copy the swap state into a parallel Spot store, prop-drill long value lists, or create a hook whose only purpose is forwarding props to `SpotProvider`.

Memoize objects with `useMemo` and functions with `useCallback`. In particular, keep stable identities for tokens, `marketReferencePrice`, `walletInteractions`, and `callbacks`.

## Provider Setup

```tsx
import { useMemo } from "react";
import {
  Module,
  Partners,
  SpotProvider,
  type Callbacks,
  type MarketReferencePrice,
  type Token,
  type WalletInteractions,
} from "@orbs-network/spot-react";

function SpotOrderForm({ module }: { module: Module }) {
  // Read these from the DEX's existing swap and wallet state.
  const {
    account,
    chainId,
    inputCurrency,
    outputCurrency,
    inputBalance,
    outputBalance,
    typedInputAmount,
    quotedInputAmount,
    quoteOutputRaw,
    isQuoteLoading,
    inputUsdPrice,
    outputUsdPrice,
    refetchBalances,
    dexWallet,
  } = useDexSpotAdapter();

  const srcToken = useMemo<Token | undefined>(() => {
    if (!inputCurrency) return undefined;
    return {
      address: inputCurrency.address,
      symbol: inputCurrency.symbol,
      decimals: inputCurrency.decimals,
      logoUrl: inputCurrency.logoUrl,
    };
  }, [inputCurrency]);

  const dstToken = useMemo<Token | undefined>(() => {
    if (!outputCurrency) return undefined;
    return {
      address: outputCurrency.address,
      symbol: outputCurrency.symbol,
      decimals: outputCurrency.decimals,
      logoUrl: outputCurrency.logoUrl,
    };
  }, [outputCurrency]);

  const marketReferencePrice = useMemo<MarketReferencePrice>(() => {
    const shouldQuote = Boolean(
      typedInputAmount && inputCurrency && outputCurrency,
    );
    const isStale = shouldQuote && typedInputAmount !== quotedInputAmount;
    const value = !shouldQuote || isStale ? undefined : quoteOutputRaw;
    const isLoading = shouldQuote && (isStale || isQuoteLoading);

    return {
      value,
      isLoading,
      noLiquidity: shouldQuote && !isLoading && !value,
    };
  }, [
    inputCurrency,
    isQuoteLoading,
    outputCurrency,
    quoteOutputRaw,
    quotedInputAmount,
    typedInputAmount,
  ]);

  const walletInteractions = useMemo<WalletInteractions>(
    () => createWalletInteractions(dexWallet),
    [dexWallet],
  );

  const callbacks = useMemo<Callbacks>(
    () => ({
      onWrapSuccess: () => refetchBalances(),
      onOrderCreated: () => refetchBalances(),
      onOrderFilled: () => refetchBalances(),
      onOrdersProgressUpdate: () => refetchBalances(),
      onCancelOrderSuccess: () => refetchBalances(),
    }),
    [refetchBalances],
  );

  return (
    <SpotProvider
      partner={Partners.Quick}
      module={module}
      typedInputAmount={typedInputAmount}
      priceProtection={3}
      minChunkSizeUsd={5}
      marketReferencePrice={marketReferencePrice}
      walletInteractions={walletInteractions}
      chainId={chainId}
      account={account}
      srcToken={srcToken}
      dstToken={dstToken}
      srcBalance={inputBalance?.toString()}
      dstBalance={outputBalance?.toString()}
      srcUsd1Token={inputUsdPrice}
      dstUsd1Token={outputUsdPrice}
      callbacks={callbacks}
      appId="my-dex"
      fees={0.25}
    >
      <SpotFormContent />
    </SpotProvider>
  );
}
```

`marketReferencePrice.value` is the DEX quote's raw destination amount for the current `typedInputAmount`, not a standalone per-token price. If the quote belongs to an older input or token pair, omit `value` and report `isLoading: true` until a current quote arrives.

Use the connected wallet chain as the UI source of truth. The provider falls back internally to a supported partner chain for configuration lookups when `chainId` is absent or unsupported, so the DEX submit area must still show connect-wallet or switch-network controls and block submission.

### SpotProvider Props

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `partner` | `Partners` | Yes | DEX partner enum |
| `module` | `Module` | Yes | `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT` |
| `typedInputAmount` | `string` | Yes | User-facing source amount from DEX state |
| `priceProtection` | `number` | Yes | Price Protection percentage; this is not swap slippage |
| `minChunkSizeUsd` | `number` | Yes | Minimum trade chunk size in USD |
| `marketReferencePrice` | `MarketReferencePrice` | Yes | `{ value?, isLoading?, noLiquidity? }` for the current DEX quote |
| `walletInteractions` | `WalletInteractions` | Yes | Five wallet methods implemented by the DEX |
| `chainId` | `number` | No | Connected wallet chain ID |
| `account` | `string` | No | Connected wallet address |
| `appId` | `string` | No | Analytics app ID |
| `srcToken` | `Token` | No | Source token metadata |
| `dstToken` | `Token` | No | Destination token metadata |
| `srcBalance` | `string` | No | Raw source-token balance |
| `dstBalance` | `string` | No | Raw destination-token balance |
| `srcUsd1Token` | `string` | No | USD value of one whole source token |
| `dstUsd1Token` | `string` | No | USD value of one whole destination token |
| `enableQueryParams` | `boolean` | No | Sync supported form state to URL query parameters |
| `callbacks` | `Callbacks` | No | Lifecycle and field-change callbacks |
| `fees` | `number` | No | Fee percentage, for example `0.25` |
| `isDev` | `boolean` | No | Use development services/configuration |
| `supportLegacyOrders` | `boolean` | No | Include supported legacy v1 orders in history |

Although balances and USD prices are optional in the TypeScript type, production integrations should pass them so validation, loading states, minimum trade size, and review details are correct.

## WalletInteractions

The DEX must implement all five methods. Write methods must wait for the transaction receipt, throw when the transaction reverts, and then return the transaction hash.

```tsx
const walletInteractions: WalletInteractions = {
  wrapNativeToken: async (amountWei) => {
    const txHash = await dexWallet.wrapNativeToken(amountWei);
    await dexWallet.waitForReceipt(txHash);
    return txHash;
  },

  approveToken: async ({ tokenAddress, amount, spenderAddress }) => {
    const txHash = await dexWallet.approveToken({
      tokenAddress,
      amount,
      spenderAddress,
    });
    await dexWallet.waitForReceipt(txHash);
    return txHash;
  },

  cancelOrder: async ({ order, contractAddress, args, abi }) => {
    const txHash = await dexWallet.writeContract({
      address: contractAddress,
      abi,
      functionName: "cancel",
      args,
    });
    await dexWallet.waitForReceipt(txHash);
    return txHash;
  },

  signOrder: ({ domain, types, primaryType, message, account }) =>
    dexWallet.signTypedData({ domain, types, primaryType, message, account }),

  getAllowance: ({ tokenAddress, spenderAddress }) =>
    dexWallet.getAllowance({ tokenAddress, spenderAddress }),
};
```

| Method | Contract |
| --- | --- |
| `wrapNativeToken(amountWei)` | Wrap native currency, wait for confirmation, return tx hash |
| `approveToken({ tokenAddress, amount, spenderAddress })` | Approve the requested spender, wait for confirmation, return tx hash |
| `cancelOrder({ order, contractAddress, args, abi })` | Call `cancel` with the supplied ABI and args, wait for confirmation, return tx hash |
| `signOrder({ domain, types, primaryType, message, account })` | Sign the supplied EIP-712 data and return signature hex |
| `getAllowance({ tokenAddress, spenderAddress })` | Return the connected account's raw allowance as a string |

## Building the Form with useSpot()

Every component rendered under `SpotProvider` can call `useSpot()`:

```tsx
const spot = useSpot();
```

| Value | Key returns |
| --- | --- |
| `dstTokenPanel` | `value`, `valueWei`, `isLoading`, `usd` |
| `tradesAmountPanel` | `totalTrades`, `maxTrades`, `onChange`, `error`, per-trade amounts, source/destination tokens |
| `durationPanel` | `duration`, input/unit callbacks, `milliseconds`, `error` |
| `fillDelayPanel` | `fillDelay`, input/unit callbacks, `milliseconds`, `error` |
| `limitPricePanel` | Raw/UI price, percentage, toggle, input/reset callbacks, tokens, USD, loading/error state |
| `triggerPricePanel` | Raw/UI trigger price, percentage, input/reset callbacks, tokens, per-chunk amounts, USD, error state |
| `pricePanel` | Inversion state/callback, source/destination tokens, market-price state |
| `disclaimerPanel` | Disclaimer translation key or `undefined` |
| `inputError` | `{ type, args }` or `undefined` |
| `submitOrderButton` | `disabled`, `loading` |
| `orderExecutionPanel` | Submission, status, steps, errors, resets, resolved tokens, and tx hashes |
| `orderHistoryPanel` | Filtered order lists, loading state, and `refetchOrders` |
| `derivedFormData` | Review amounts, prices, timing, fees, order type, spender, and RePermit data |
| `supportedChains` | Supported chain IDs for the selected partner |
| `module` | Current `Module` |
| `refetchUntilStatusSynced` | Mutation used to reconcile cancellation status |

Child components should call `useSpot()` themselves instead of receiving hook-returned panels through intermediate props.

### Panel Visibility

| Panel | TWAP | LIMIT | STOP_LOSS | TAKE_PROFIT |
| --- | --- | --- | --- | --- |
| Trades amount | Yes | — | — | — |
| Fill delay | Yes | — | — | — |
| Duration | — | Yes | Yes | Yes |
| Limit price | Yes, optional | Always on | Optional | Optional |
| Trigger price | — | — | Yes | Yes |

Use `TimeUnit.Minutes`, `TimeUnit.Hours`, and `TimeUnit.Days` for duration and fill-delay controls. Resolve error and disclaimer keys through the DEX's i18n system.

### Display Amounts

Raw fields such as `dstTokenPanel.valueWei`, `tradesAmountPanel.amountPerTrade`, `derivedFormData.feesAmount`, and history fill amounts are integer strings. Convert them into the DEX's native amount type before display when possible:

```tsx
const amount = CurrencyAmount.fromRawAmount(
  inputCurrency,
  spot.tradesAmountPanel.amountPerTrade,
);

return `${amount.toSignificant()} ${inputCurrency.symbol}`;
```

Use `*UI` fields for editable text inputs or when the DEX has no amount object. Do not format raw integer strings directly for user display.

## Submit and Progress Modal

Use `useSpot().orderExecutionPanel` for execution state, `derivedFormData` for review details, and `@orbs-network/swap-ui`'s `SwapFlow` for the creation/progress UI.

```tsx
import { SwapFlow } from "@orbs-network/swap-ui";
import { useSpot } from "@orbs-network/spot-react";

function SpotOrderFlow() {
  const {
    status,
    parsedError,
    srcToken,
    dstToken,
    stepIndex,
    totalSteps,
  } = useSpot().orderExecutionPanel;
  const form = useSpot().derivedFormData;

  return (
    <SwapFlow
      inAmount={form.srcAmountUI}
      outAmount={form.dstAmountUI}
      inToken={{ symbol: srcToken?.symbol, logoUrl: srcToken?.logoUrl }}
      outToken={{ symbol: dstToken?.symbol, logoUrl: dstToken?.logoUrl }}
      swapStatus={status}
      currentStepIndex={stepIndex}
      totalSteps={totalSteps}
      components={{
        Main: <SwapFlow.Main inUsd={form.srcAmountUsd} outUsd={form.dstAmountUsd} />,
        Success: <SwapFlow.Success title="Order created" />,
        Failed: <SwapFlow.Failed error={parsedError?.message} />,
      }}
    />
  );
}
```

Wrap `SwapFlow` in the DEX's modal shell and skin it with DEX colors, surfaces, typography, token logos, and loaders. Once `orderExecutionPanel.status` is set, hide the review details, confirm button, duplicate title, and secondary footer actions so the progress/success/failure content owns the modal.

### Execution State and Reset

`orderExecutionPanel` includes:

- `onSubmit`, `status`, `isLoading`, `isSuccess`, `isFailed`, and `confirmButtonLoading`;
- `step`, `stepIndex`, `totalSteps`, and `pendingSteps`;
- `parsedError`, `error`, `srcToken`, `dstToken`, `wrapTxHash`, and `approveTxHash`;
- `resetCurrentSwap()` and `resetState()`.

`spot-react` does not clear the DEX input. Do that only when a successful modal closes:

```tsx
const { status, isSuccess, resetCurrentSwap, resetState } =
  useSpot().orderExecutionPanel;

const onClose = useCallback(() => {
  setIsModalOpen(false);

  if (isSuccess) {
    setInputAmount("");
    setTimeout(resetState, 500);
  } else if (status) {
    setTimeout(resetCurrentSwap, 500);
  }
}, [isSuccess, resetCurrentSwap, resetState, setInputAmount, status]);
```

Failed or rejected submissions should keep the user's input. The short delay lets the close animation finish before state resets.

## Callbacks

Callbacks cover wallet notifications, analytics, field synchronization, and balance refresh:

```tsx
const callbacks: Callbacks = {
  onWrapRequest: () => {},
  onWrapSuccess: ({ txHash, explorerUrl, amount }) => {},
  onApproveRequest: () => {},
  onApproveSuccess: ({ txHash, explorerUrl, token, amount }) => {},
  onSignOrderRequest: () => {},
  onSignOrderSuccess: (signature) => {},
  onSignOrderError: (error) => {},
  onOrderCreated: (order) => {},
  onOrderFilled: (order) => {},
  onOrdersProgressUpdate: (orders) => {},
  onSubmitOrderFailed: ({ code, message }) => {},
  onSubmitOrderRejected: () => {},
  onCancelOrderRequest: (order) => {},
  onCancelOrderSuccess: ({ order, txHash, explorerUrl }) => {},
  onCancelOrderFailed: (error) => {},
  onCopy: () => {},
  onLimitPriceChange: (price) => {},
  onLimitPricePercentChange: (percent) => {},
  onTriggerPriceChange: (price) => {},
  onTriggerPricePercentChange: (percent) => {},
  onDurationChange: (duration) => {},
  onFillDelayChange: (fillDelay) => {},
  onChunksChange: (chunks) => {},
};
```

Refetch balances in `onWrapSuccess`, `onOrderCreated`, `onOrderFilled`, `onOrdersProgressUpdate`, and `onCancelOrderSuccess`. Avoid an `onOrderCreated` toast unless the host DEX specifically wants one; the submit modal already shows creation success.

## Cancellation and Order History

Use the exported cancellation hook inside `SpotProvider`:

```tsx
import { OrderStatus, useCancelOrder } from "@orbs-network/spot-react";

function CancelButton({ order }) {
  const { cancelOrder, isLoading, isSuccess, isError, error, txHash } =
    useCancelOrder(order);

  if (order.status !== OrderStatus.Open) return null;

  return (
    <button onClick={cancelOrder} disabled={isLoading}>
      {isLoading ? "Cancelling..." : "Cancel"}
    </button>
  );
}
```

Order history is available from `useSpot().orderHistoryPanel`:

```tsx
const { orders, isLoading, isRefetching, refetchOrders } =
  useSpot().orderHistoryPanel;

// orders.all, orders.open, orders.completed, orders.cancelled, orders.expired
```

Use `useDerivedHistoryOrder(order, srcToken?, dstToken?)` for display fields. For large histories, use the virtualization library already present in the DEX for both the orders and fills lists. Store the selected order ID, then look up the current order from `orders.all`; do not store a stale copy of the order object.

Keep history, details, and modal portals under `SpotProvider` context. Details should include execution summary, order info, fills, explorer/copy actions, and cancellation for open orders.

## Translations

The SDK returns keys rather than final user-facing strings.

Disclaimer keys are:

- `limitOrderDisclaimer`
- `marketOrderDisclaimer`
- `triggerMarketPriceDisclaimer`

Input errors have the shape `{ type, args }`. Resolve `type` through the DEX's i18n system and interpolate `args`, including values such as `maxChunks`, `minChunks`, `minTradeSize`, `duration`, and `fillDelay`. Current duration and fill-delay arguments are human-readable; custom or older integrations should convert raw milliseconds before display.

## Helper and Advanced APIs

```tsx
import {
  useAmountUi,      // (decimals?, rawAmount?) => formatted amount
  useExplorerLink,  // (txHash?) => explorer URL
  useNetwork,       // () => current network metadata
  useSignOrder,     // low-level signing hook
  useSubmitOrder,   // low-level submission mutation
  useSwapExecution, // low-level execution state
} from "@orbs-network/spot-react";
```

Normal integrations should submit through `useSpot().orderExecutionPanel`. Use the low-level hooks only when deliberately replacing the built-in execution flow.

Public utilities and constants include:

```tsx
import {
  getConfig,
  getMinChunkSizeUsd,
  getNetwork,
  getOrderExecutionRate,
  getOrderFillDelayMillis,
  getOrderLimitPriceRate,
  getPartnerChains,
  getPartners,
  getTriggerPriceRate,
  eqIgnoreCase,
  isNativeAddress,
  DISCLAIMER_URL,
  ORBS_TWAP_FAQ_URL,
  ORBS_SLTP_FAQ_URL,
  ORBS_LOGO,
  ORBS_WEBSITE_URL,
  SPOT_VERSION,
  networks,
} from "@orbs-network/spot-react";
```

Always import from `@orbs-network/spot-react`. Do not import from `dist/*` or package-internal source paths, and verify public exports when upgrading.

## Integration Checklist

- Use the DEX's existing tokens, inputs, selectors, components, styling, wallet controls, and routing.
- Keep chain switching out of the Spot token selector; use the DEX network control.
- Keep the form visible while disconnected; replace only the submit area with connect/switch controls.
- Persist Price Protection separately from swap slippage and hide the DEX slippage setting while Spot is active.
- Use `@orbs-network/swap-ui` for order creation/progress content.
- Convert raw amounts into the DEX's amount type before display.
- Use callbacks for balance refetch and reset the input only after success.
- Put Spot tabs beside the Swap tab using the DEX's navigation pattern.
- Split production integrations into focused `components`, `hooks`, `context`, and `utils` files.
- Do not add another error boundary around Spot; `SpotProvider` already includes one.

## License

MIT

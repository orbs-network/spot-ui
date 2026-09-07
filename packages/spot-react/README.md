# @orbs-network/spot-react

React SDK for building TWAP, Limit, Stop-Loss, and Take-Profit order interfaces on top of the [Orbs Spot protocol](https://www.orbs.com/).

`spot-react` owns Spot order state and exposes it through `SpotProvider` and focused named hooks. The host DEX remains responsible for swap-form state, wallet access, components, styling, translations, routing, and modal shells.

For the complete integration workflow, see the [Spot React integration skill](https://github.com/orbs-network/spot-ui/tree/master/skills/spot-react-integration) and the [reference implementation](https://github.com/orbs-network/spot-ui/blob/master/apps/web/components/spot/spot-form.tsx).

## Before You Start

Every DEX needs a member of the exported `Partners` enum and a server-side Orbs Spot configuration for its supported chains. The SDK fetches contract and adapter addresses from that configuration. If the DEX is not configured yet, contact [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup) before integrating.

### RePermit configuration security

The `/config` endpoint is a security boundary. The SDK rejects configurations whose domain or order chain differs from the requested chain, and rejects zero or malformed RePermit and exchange-adapter addresses. It uses `domain.verifyingContract` as the ERC-20 approval spender and the v2 cancellation contract, and uses the returned adapter, reactor, and executor when constructing orders. The SDK does not independently verify deployed bytecode or contract identity, so deployments must use the trusted Orbs endpoint over TLS and contract-address changes require explicit approval from the protocol/security owner.

`SpotProvider` initializes the `spot-ui` client only when the connected chain supports the selected partner. It never substitutes another chain. Client state and order history are scoped to that provider, with no global cache or host query provider required. The framework-neutral `createClient` factory also retains no global state. The client owns configuration-dependent order preparation, signing/approval/cancellation request values, submission, and configured history access; calculations remain package-level functions. Form previews and order construction share the framework-agnostic `calculateOrderForm` model, so defaults, prices, trades, schedules, errors, raw/token-formatted/USD values, and signed execution values cannot diverge. Form calculation is time-independent; `prepareOrder` assigns fresh start, deadline, and nonce values after wrapping and approval, immediately before signing. Initialization is retried twice. After those retries, the provider keeps its children mounted and renders the retryable `clientErrorFallback` alongside them. Supply that component to localize and style the error for the host DEX.

The authoritative shared model is available from `useOrderForm()`.

Each mounted `SpotProvider` owns one stable store. Changing the module or token
pair reapplies form defaults without recreating the partner/chain client,
history cache, or cancellation state. If that scope changes during execution,
the reset waits until the frozen execution reaches a terminal phase. Changing
partner or chain reconfigures only the resources whose keys actually changed.

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

### Migrating from 1.x

Version 2 is a deliberately breaking, headless API. Replace the broad `useSpot`
and `useSwapExecution` interfaces with focused hooks such as `useOrderForm`,
`useExecution`, `useSubmitButton`, and `useOrders`. Provider values now use
`input`/`output` terminology (`inputToken`, `outputToken`, `inputBalance`, and
`minTradeSizeUsd`), and the host supplies wallet operations through
`walletInteractions`. Debug query parameters and the `isDev` option are no
longer supported.

`@orbs-network/swap-ui` is a recommended companion for the documented order
progress modal, but it is not imported by `spot-react` and is not required for
a headless or custom-progress integration.

### Peer Dependency

The host application must provide React. Zustand is an internal runtime
dependency of `spot-react`; integrators do not install or configure it.

| Package | Version |
| --- | --- |
| `react` | `^18 \|\| ^19` |

`viem` is not a dependency. Adapt the wallet library already used by the DEX through `walletInteractions`.

The published entry includes a `"use client"` directive, so it can be imported
directly from a Next.js App Router client component.

## Integration Model

Keep the DEX swap form as the source of truth. Pass the following adapted values directly to `SpotProvider`:

| Value | Expected shape |
| --- | --- |
| Selected tokens | `Token` objects with `address`, `symbol`, `decimals`, and optional `logoUrl` |
| Typed source amount | User-facing decimal string, for example `"1.25"` |
| Quote output | Raw destination-token amount for the current typed input |
| Input balance | Raw integer string |
| USD prices | USD value of exactly one whole source/destination token |
| Chain and account | Values from the connected wallet/account state |

If several Spot components need the same DEX-owned values, expose a small DEX adapter context. Do not copy the swap state into a parallel Spot store, prop-drill long value lists, or create a hook whose only purpose is forwarding props to `SpotProvider`.

Memoize objects with `useMemo` and functions with `useCallback`. In particular, keep stable identities for tokens, `marketReferencePrice`, `walletInteractions`, and `callbacks`.

## Provider Setup

```tsx
import { useMemo } from "react";
import {
  type ClientErrorFallbackProps,
  Module,
  Partners,
  SpotProvider,
  type Callbacks,
  type MarketReferencePrice,
  type Token,
  type WalletInteractions,
} from "@orbs-network/spot-react";

function ClientErrorFallback({
  error,
  retry,
  isRetrying,
}: ClientErrorFallbackProps) {
  return (
    <div role="alert">
      <p>{getLocalizedErrorMessage(error)}</p>
      <button type="button" disabled={isRetrying} onClick={retry}>
        {isRetrying ? t("retrying") : t("retry")}
      </button>
    </div>
  );
}

function SpotOrderForm({ module }: { module: Module }) {
  // Read these from the DEX's existing swap and wallet state.
  const {
    account,
    chainId,
    inputCurrency,
    outputCurrency,
    inputBalance,
    typedInputAmount,
    quotedInputAmount,
    quoteOutputRaw,
    isQuoteLoading,
    inputUsdPrice,
    outputUsdPrice,
    refetchBalances,
    dexWallet,
  } = useDexSpotAdapter();

  const inputToken = useMemo<Token | undefined>(() => {
    if (!inputCurrency) return undefined;
    return {
      address: inputCurrency.address,
      symbol: inputCurrency.symbol,
      decimals: inputCurrency.decimals,
      logoUrl: inputCurrency.logoUrl,
    };
  }, [inputCurrency]);

  const outputToken = useMemo<Token | undefined>(() => {
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
      minTradeSizeUsd={5}
      marketReferencePrice={marketReferencePrice}
      walletInteractions={walletInteractions}
      chainId={chainId}
      account={account}
      inputToken={inputToken}
      outputToken={outputToken}
      inputBalance={inputBalance?.toString()}
      inputUsd1Token={inputUsdPrice}
      outputUsd1Token={outputUsdPrice}
      callbacks={callbacks}
      clientErrorFallback={ClientErrorFallback}
      appId="my-dex"
      displayFeePercent={0.25}
    >
      <SpotFormContent />
    </SpotProvider>
  );
}
```

`marketReferencePrice.value` is the DEX quote's raw destination amount for the current `typedInputAmount`, not a standalone per-token price. If the quote belongs to an older input or token pair, omit `value` and report `isLoading: true` until a current quote arrives.

Use the connected wallet chain as the source of truth. When it is absent or unsupported, the provider does not initialize a client and submission stays disabled. The DEX submit area should show its connect-wallet or switch-network control.

### SpotProvider Props

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `partner` | `Partners` | Yes | DEX partner enum |
| `module` | `Module` | Yes | `TWAP`, `LIMIT`, `STOP_LOSS`, or `TAKE_PROFIT` |
| `typedInputAmount` | `string` | Yes | User-facing source amount from DEX state |
| `priceProtection` | `number` | Yes | Price Protection percentage; this is not swap slippage |
| `minTradeSizeUsd` | `number` | Yes | Minimum individual trade size in USD |
| `marketReferencePrice` | `MarketReferencePrice` | Yes | `{ value?, isLoading?, noLiquidity? }` for the current DEX quote |
| `walletInteractions` | `WalletInteractions` | Yes | Five wallet methods implemented by the DEX |
| `chainId` | `number` | No | Connected wallet chain ID |
| `account` | `Address` | No | Connected wallet address |
| `appId` | `string` | No | Stable host-defined analytics identifier (for example the DEX slug) |
| `inputToken` | `Token` | No | Input token metadata |
| `outputToken` | `Token` | No | Output token metadata |
| `inputBalance` | `string` | No | Raw input-token balance |
| `inputUsd1Token` | `string` | No | USD value of one whole input token |
| `outputUsd1Token` | `string` | No | USD value of one whole output token |
| `callbacks` | `Callbacks` | No | Lifecycle and field-change callbacks |
| `displayFeePercent` | `number` | No | Display-only fee estimate percentage; does not collect or subtract fees |
| `supportLegacyOrders` | `boolean` | No | Include supported legacy v1 orders in history |
| `clientErrorFallback` | `ComponentType<ClientErrorFallbackProps>` | No | Host-rendered client initialization error UI with `error`, `retry`, and `isRetrying` |
| `errorFallback` | `ComponentType<SpotErrorFallbackProps>` | No | Host-rendered fallback for unexpected calculation or rendering errors |

Although the input balance and USD prices are optional in the TypeScript type, production integrations should pass them so validation, loading states, minimum trade size, and review details are correct.

`minTradeSizeUsd` must be a positive USD threshold approved for the partner;
there is intentionally no SDK default. `priceProtection` is a percentage, so
`3` means 3% (300 bps). `displayFeePercent` only populates `form.fees` for the
review UI. Protocol fee collection is configured separately by the partner and
backend.

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

  signOrder: ({ signerAddress, typedData }) =>
    dexWallet.signTypedData({ ...typedData, account: signerAddress }),

  getAllowance: ({ tokenAddress, spenderAddress }) =>
    dexWallet.getAllowance({ tokenAddress, spenderAddress }),
};
```

| Method | Contract |
| --- | --- |
| `wrapNativeToken(amountWei)` | Wrap native currency, wait for confirmation, return tx hash |
| `approveToken({ tokenAddress, amount, spenderAddress })` | Approve the requested spender, wait for confirmation, return tx hash |
| `cancelOrder({ order, contractAddress, args, abi })` | Call `cancel` with the supplied ABI and args, wait for confirmation, return tx hash |
| `signOrder({ signerAddress, typedData })` | Adapt the framework-neutral EIP-712 request to the host wallet and return its original `0x`-prefixed signature |
| `getAllowance({ tokenAddress, spenderAddress })` | Return the connected account's raw allowance as a string |

The signature returned by `signOrder` is submitted unchanged. Do not split it into `{ v, r, s }`, rewrite its recovery byte, or otherwise normalize the wallet's byte representation.

## Building with focused hooks

Import only the hooks each component needs. Leaf components should call the
smallest hook that provides what they render:

```tsx
import {
  useExecution,
  useLimitPrice,
  useOrderForm,
  useOrders,
  useOutputAmount,
  usePriceDisplay,
  useTrades,
} from "@orbs-network/spot-react";

const calculatedForm = useOrderForm();
const tradesPanel = useTrades();
const limitPricePanel = useLimitPrice();
const outputAmount = useOutputAmount();

const execution = useExecution();
const history = useOrders();
```

`useOrderForm()` reads the calculated form shared by `OrderFormProvider`; it does not rerun the calculation. The other hooks expose smaller panel contracts for clearer component code. They currently share the same calculated-form context, so a form update can rerender every mounted form-panel hook.

| Value | Key returns |
| --- | --- |
| `useOutputAmount()` | `amount: { raw, ui, usd }`, `isLoading` |
| `useTrades()` | `totalTrades`, `maxTrades`, `onChange`, `error`, structured input/min-output/trigger-output amounts, input/output tokens |
| `useDuration()` | `duration`, input/unit callbacks, `milliseconds`, `error` |
| `useFillDelay()` | `fillDelay`, input/unit callbacks, `milliseconds`, `error` |
| `useLimitPrice()` | `price: { raw, ui, usd }`, canonical raw price, percentage, enable/toggle actions, tokens, loading/error state |
| `useTriggerPrice()` | `price: { raw, ui, usd }`, canonical raw price, percentage, structured output-per-trade amount, tokens, loading/error state |
| `usePriceDisplay()` | Inversion state/callback, actual and display-direction tokens, market-order state |
| `useDisclaimer()` | Disclaimer translation key or `undefined` |
| `useInputErrors()` | `{ type, args }` or `undefined` |
| `useSubmitButton()` | `disabled` and `loading` |
| `useExecution()` | Submission, status, steps, errors, resets, resolved tokens, and tx hashes |
| `useOrders()` | Provider-scoped categorized order lists and polling state |
| `useHistoryOrder()` | Display-ready values for one history order |
| `useCancelOrder()` | Per-order cancellation state and action |
| `useClient()` | Provider-scoped initialized client state |
| `useAmountUi()` | Raw-token amount formatting |
| `useExplorerLink()` | Chain explorer transaction URL |
| `useNetwork()` | Current or specified network metadata |

Child components should call the relevant focused hook themselves instead of receiving hook-returned panels through intermediate props. `useOrders()` activates order-history fetching while an orders consumer is mounted; form-only integrations do not fetch or poll history.

Keep the submit button disabled while `loading` is true. If client initialization fails, `SpotProvider` keeps child components mounted and renders the retryable `clientErrorFallback` alongside them.

### Trade-count validation behavior

An explicitly selected TWAP trade count persists when `typedInputAmount` changes. If lowering the amount makes that count greater than the newly calculated `maxTrades`, Spot does not clamp or reset it: `useTrades().error` and `useInputErrors()` report `InputErrors.MAX_TRADES`, and submission remains disabled until the user selects a valid count. This is an intentional behavior change from integrations that silently reset the trade count on every amount edit. Hosts should render the returned validation error so the user can correct the value.

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

Every calculated amount uses the same `{ raw, ui, usd }` shape. Convert `raw`
into the DEX's native amount type before display when possible:

```tsx
const amount = CurrencyAmount.fromRawAmount(
  inputCurrency,
  tradesPanel.inputAmountPerTrade.raw,
);

return `${amount.toSignificant()} ${inputCurrency.symbol}`;
```

Use `.ui` for editable text inputs or when the DEX has no amount object. Do not
format `.raw` integer strings directly for user display.

## Submit and Progress Modal

Use `useExecution()` for execution state, `useOrderForm()` for review details, and `@orbs-network/swap-ui`'s `SwapFlow` for the creation/progress UI.

```tsx
import { SwapFlow, SwapStatus as SwapUiStatus } from "@orbs-network/swap-ui";
import {
  ExecutionStatus,
  useExecution,
  useOrderForm,
} from "@orbs-network/spot-react";

function SpotOrderFlow() {
  const {
    status,
    error,
    inputToken,
    outputToken,
    currentStepIndex,
    totalSteps,
  } = useExecution();
  const form = useOrderForm();
  const swapStatus =
    status === ExecutionStatus.SUCCESS
      ? SwapUiStatus.SUCCESS
      : status === ExecutionStatus.FAILED
        ? SwapUiStatus.FAILED
        : status === ExecutionStatus.LOADING
          ? SwapUiStatus.LOADING
          : undefined;

  return (
    <SwapFlow
      inAmount={form.inputAmount.ui}
      outAmount={form.outputAmount.ui}
      inToken={{ symbol: inputToken?.symbol, logoUrl: inputToken?.logoUrl }}
      outToken={{ symbol: outputToken?.symbol, logoUrl: outputToken?.logoUrl }}
      swapStatus={swapStatus}
      currentStepIndex={currentStepIndex}
      totalSteps={totalSteps}
      components={{
        Main: <SwapFlow.Main inUsd={form.inputAmount.usd} outUsd={form.outputAmount.usd} />,
        Success: <SwapFlow.Success title="Order created" />,
        Failed: <SwapFlow.Failed error={error?.message} />,
      }}
    />
  );
}
```

Wrap `SwapFlow` in the DEX's modal shell and skin it with DEX colors, surfaces, typography, token logos, and loaders. Once `useExecution().status` is set, hide the review details, confirm button, duplicate title, and secondary footer actions so the progress/success/failure content owns the modal.

### Execution State and Reset

`useExecution()` returns:

- `submitOrder`, `phase`, `status`, `isExecuting`, `isSuccess`, `isFailed`, `isRejected`, `isPreparingOrder`, and `canDismiss`;
- `currentStep`, `currentStepIndex`, `totalSteps`, and `executionSteps`;
- `error`, `inputToken`, `outputToken`, `chainId`, `wrapTxHash`, and `approvalTxHash`;
- `returnToOrderForm()` and `startNewOrder()`.

`spot-react` does not clear the DEX input. Do that only when a successful modal closes:

```tsx
const { status, isSuccess, isExecuting, returnToOrderForm, startNewOrder } =
  useExecution();

const onClose = useCallback(() => {
  if (isExecuting) return;
  setIsModalOpen(false);

  if (isSuccess) {
    setInputAmount("");
    setTimeout(startNewOrder, 500);
  } else if (status) {
    setTimeout(returnToOrderForm, 500);
  }
}, [isExecuting, isSuccess, returnToOrderForm, setInputAmount, startNewOrder, status]);
```

Neither reset action can clear an active execution: both return `false` while `isExecuting` is true. Keep the modal open during execution. `returnToOrderForm()` dismisses a failed or rejected execution while preserving the form and a completed native-token wrap for a safe retry. `startNewOrder()` resets Spot's internal form state and all retry metadata after a terminal execution; the host must still clear its own input amount. The short delay lets the close animation finish before state resets.

`phase` is the precise execution state: `idle → preparing → wrapping → approving → signing → submitting → success`, with `failed` and `rejected` terminal branches. `status` is the coarser `ExecutionStatus` value. Map it explicitly to the separately versioned `@orbs-network/swap-ui` `SwapStatus` enum as shown above. Each attempt has an internal identity, duplicate starts are rejected atomically, and stale async writes cannot replace a newer attempt. Host callbacks are observational: synchronous throws and rejected callback promises never change a wallet or API result.

Once submission begins, `useOrderForm()` exposes the frozen form and `useExecution()` exposes the frozen tokens and chain associated with that execution. The prepared order is frozen internally and reused through approval, wrapping, signing, and submission. Host quote, token, chain, or time updates cannot change the active order.

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
  onTradesChange: (trades) => {},
};
```

Refetch balances in `onWrapSuccess`, `onOrderCreated`, `onOrderFilled`, `onOrdersProgressUpdate`, and `onCancelOrderSuccess`. Avoid an `onOrderCreated` toast unless the host DEX specifically wants one; the submit modal already shows creation success.

## Cancellation and Order History

Use the exported cancellation hook inside `SpotProvider`:

```tsx
import { OrderStatus, useCancelOrder } from "@orbs-network/spot-react";

function CancelButton({ order }) {
  const { cancelOrder, disabled, isLoading, isSuccess, isError, error, txHash } =
    useCancelOrder(order);

  if (order.status !== OrderStatus.Open) return null;

  return (
    <button onClick={cancelOrder} disabled={disabled || isLoading}>
      {isLoading ? "Cancelling..." : "Cancel"}
    </button>
  );
}
```

Cancellation uses the initialized client for both v1 and v2 orders, keeping request construction on one path; `disabled` remains true while that client is loading or unavailable. History starts after client initialization because v2 requests need the configured exchange adapter. When `supportLegacyOrders` is enabled, v1 history is loaded once and retained while v2 history continues polling.

Order history is available directly from `useOrders()`. The query is enabled only while a component using this hook is mounted:

```tsx
const { data: orders, isLoading, isRefetching, refetch } = useOrders();

// orders?.all, orders?.open, orders?.completed, orders?.cancelled, orders?.expired
```

Like `useClient()`, `data` is undefined before the first result. `refetch()`
resolves to the latest categorized orders or `undefined` when no request can be
made. Default the category you render to an empty array, for example
`const allOrders = orders?.all ?? []`.

Use `useHistoryOrder(order, inputToken?, outputToken?)` for display fields. For large histories, use the virtualization library already present in the DEX for both the orders and fills lists. Store the selected `order.historyKey`, then look up the current order from `orders?.all ?? []` by that key; do not store a stale copy of the order object. The key avoids collisions between numeric v1 IDs from different TWAP contracts; `order.id` remains the protocol ID used for display and cancellation.

Amounts returned by `useHistoryOrder` and its `fills` use `{ raw, ui }`, matching
the form model without fabricating unavailable historical USD values.

`OrderFilter` contains `ALL`, `OPEN`, `COMPLETED`, `CANCELLED`, and `EXPIRED`.
`OrderType` identifies the calculated module/mode combination: limit, TWAP
market/limit, stop-loss market/limit, or take-profit market/limit. Normalized
`Order` and `OrderFill` retain `src`/`dst` and `in`/`out` names because those are
protocol/history response models; form-facing APIs use `input`/`output`.

Keep history, details, and modal portals under `SpotProvider` context. Details should include execution summary, order info, fills, explorer/copy actions, and cancellation for open orders.

## Translations

The SDK returns keys rather than final user-facing strings.

Disclaimer keys are:

- `limitOrderDisclaimer`
- `marketOrderDisclaimer`
- `triggerMarketPriceDisclaimer`

Input errors have the shape `{ type, args }`. Resolve `type` through the DEX's i18n system and interpolate `args`, including values such as `maxTrades`, `minTrades`, `minTradeSize`, `duration`, and `fillDelay`. Current duration and fill-delay arguments are human-readable; custom or older integrations should convert raw milliseconds before display.

## React helper APIs

```tsx
import {
  useAmountUi,
  useClient,
  useExplorerLink,
  useNetwork,
} from "@orbs-network/spot-react";

useAmountUi(decimals, rawAmount);
useClient();
useExplorerLink(txHash, chainId);
useNetwork(chainId);
```

Submit through `useExecution()`. Internal mutations and execution-store hooks
are deliberately not exported, keeping one supported workflow and one error
contract. `useClient()` must be called under `SpotProvider`; every caller shares
the same partner/chain query, and RePermit configuration is available as
`client?.rePermitData`. Initialization recovery belongs to
`clientErrorFallback`, which receives the query error and retry action.

Public utilities and constants include:

```tsx
import {
  getNetwork,
  getOrderExecutionRate,
  getOrderFillDelayMillis,
  getOrderLimitPriceRate,
  getPartnerChains,
  getPartners,
  getTwapConfig,
  calculateOrderForm,
  toAmountWei,
  toAmountUI,
  invertPriceInput,
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

React integrations can import the single `calculateOrderForm` entry point and
its public calculated types directly from `@orbs-network/spot-react`. Non-React
integrations should import them from `@orbs-network/spot-ui`. Lower-level
calculators remain internal entry points; do not import from `dist/*` or
package-internal source paths.

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

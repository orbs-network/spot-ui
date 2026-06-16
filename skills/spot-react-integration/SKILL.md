---
name: spot-react-integration
description: Integration guide for @orbs-network/spot-react into a DEX frontend. Covers SpotProvider setup, DEX swap-state adapters, walletInteractions, hook-driven panels (TWAP, Limit, Stop-Loss, Take-Profit), order submission, lifecycle callbacks, order history, and DEX-native styling. Produces a fully functional advanced orders UI that matches the host DEX look and feel.
---

# Spot React Integration

Use this skill to integrate `@orbs-network/spot-react` into any DEX frontend. The library provides a single `useSpot()` hook that exposes all panel data and callbacks for TWAP, Limit, Stop-Loss, and Take-Profit orders. The integration wraps the DEX's existing components so the result matches the DEX look and feel.

## Expected Result

The completed integration should include:

1. A `SpotProvider` wired to the DEX's tokens, typed input amount, balances, USD prices, market quote, partner config, account, chain, callbacks, and `walletInteractions`.
2. A DEX-native order form with token inputs, price controls, TWAP duration/trade controls, validation errors, disclaimers, and a submit modal.
3. Four module entry points or tabs: TWAP, Limit, Stop-Loss, and Take-Profit, using the DEX's existing navigation pattern.
4. Order history and cancellation UI built inside `SpotProvider` scope or rendered through a context-preserving portal.
5. No direct dependency on a wallet library from `spot-react`; the DEX adapts its existing wallet stack through `walletInteractions`.

## Distribution

This skill lives in `skills/spot-react-integration/` of the [`orbs-network/spot-ui`](https://github.com/orbs-network/spot-ui) repository, and is also available under `node_modules/@orbs-network/spot-react/.cursor/`.

## Reference Implementation

Working example: [`apps/web/components/spot/spot-form.tsx`](https://github.com/orbs-network/spot-ui/blob/master/apps/web/components/spot/spot-form.tsx)

## Workflow

1. Read [references/01-quickstart.md](references/01-quickstart.md) for install, peer dependencies, pre-checks, and the minimum integration steps.
2. Read [references/02-provider.md](references/02-provider.md) for SpotProvider props, DEX swap-state ownership, quote freshness, USD prices, callbacks, input reset, and memoization rules.
3. Read [references/03-panels.md](references/03-panels.md) for `useSpot()` hook panels: price, duration, trades, fill delay, disclaimer, submit, and order history.
4. Read [references/04-principles.md](references/04-principles.md) for integration principles, layout rules, module navigation, token selector behavior, and the final checklist.
5. Use [assets/spot-form-skeleton.tsx](assets/spot-form-skeleton.tsx) as a starting template.
6. Before finalizing, verify current public exports/types in `@orbs-network/spot-react`; do not assume internal hooks or `dist/*` paths exist.

## Guardrails

1. Every DEX needs its own config. If one doesn't exist, contact **[@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup)** on Telegram before starting.
2. Install `@orbs-network/spot-react` and its peer dependencies (`@tanstack/react-query`, `bignumber.js`, `react-error-boundary`, `zustand`).
3. Never import from `@orbs-network/spot-react/dist/*`. Always from `@orbs-network/spot-react`.
4. Use DEX components as-is. Don't modify them. Create new ones using DEX styles when needed.
5. Wrap objects with `useMemo`, functions with `useCallback` in SpotProvider props. Pass values directly to `SpotProvider`; do not create a separate "provider props" hook just to forward values.
6. Verify all imports exist in the package before using them.
7. Balance refetch goes in callbacks (`onWrapSuccess`, `onOrderCreated`, `onOrderFilled`, `onOrdersProgressUpdate`, `onCancelOrderSuccess`), not as a prop. Avoid an "order created" toast unless the host DEX explicitly wants one; success is already shown in the submit modal.
8. Input amount reset goes in the modal's `onClose` callback only when the order succeeds. Clear the DEX input and call `resetState()` on success; for failed/rejected submissions, keep the input and call `resetCurrentSwap()`.
9. All Spot panel data comes from `useSpot()`. Child components should call their own hooks instead of receiving values that the hook can return. Cancel orders use `useCancelOrder(order)`. Do not import package-internal hooks; only use exported advanced hooks (`useSignOrder`, `useSubmitOrder`, `useSwapExecution`) when deliberately replacing the built-in submit flow.
10. The DEX must provide `walletInteractions` — an object with 5 methods for wallet operations (`wrapNativeToken`, `approveToken`, `cancelOrder`, `signOrder`, `getAllowance`). spot-react does not include viem or any wallet library, and write methods should wait for transaction receipts.
11. Keep source-of-truth swap state in the DEX swap form context/store. If multiple Spot components need it, expose a small DEX-owned context such as `SpotSwapFormStateProvider`; do not prop-drill swap form state.
12. Convert raw Spot amounts to the DEX's amount type before display when possible (for example `CurrencyAmount.fromRawAmount`). Display with the DEX's formatter or `.toSignificant()` / `.toExact()` as appropriate; do not format raw integer strings directly, except when intentionally sending raw values into transactions or SDK calls.
13. If Spot reuses the DEX token selector, lock it to the connected/account chain for Spot and hide chain switching. Advanced orders should not allow changing chain from inside token search.
14. Use the connected wallet/account chain as the UI source of truth. `SpotProvider` falls back internally to a supported partner chain when `chainId` is missing or unsupported, so the DEX submit area must still show connect/switch-network controls to avoid a hidden chain mismatch.

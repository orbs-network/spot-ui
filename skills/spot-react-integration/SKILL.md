---
name: spot-react-integration
description: Integration guide for @orbs-network/spot-react into a DEX frontend. Covers SpotProvider setup, hook-driven panels (TWAP, Limit, Stop-Loss, Take-Profit), order submission, order history, and DEX-native styling. Produces a fully functional advanced orders UI that matches the host DEX look and feel.
---

# Spot React Integration

Use this skill to integrate `@orbs-network/spot-react` into any DEX frontend. The library provides a single `useSpot()` hook that exposes all panel data and callbacks for TWAP, Limit, Stop-Loss, and Take-Profit orders. The integration wraps the DEX's existing components so the result matches the DEX look and feel.

## Distribution

This skill lives in `skills/spot-react-integration/` of the [`orbs-network/spot-ui`](https://github.com/orbs-network/spot-ui) repository, and is also available under `node_modules/@orbs-network/spot-react/.cursor/`.

## Reference Implementation

Working example: [`apps/web/components/spot/spot-form.tsx`](https://github.com/orbs-network/spot-ui/blob/master/apps/web/components/spot/spot-form.tsx)

## Workflow

1. Read [references/01-quickstart.md](references/01-quickstart.md) for install, peer dependencies, pre-checks, and the minimum integration steps.
2. Read [references/02-provider.md](references/02-provider.md) for SpotProvider props, input reset, balance refetch, overrides, and memoization rules.
3. Read [references/03-panels.md](references/03-panels.md) for `useSpot()` hook panels: price, duration, trades, fill delay, disclaimer, submit, and order history.
4. Read [references/04-principles.md](references/04-principles.md) for integration principles, layout rules, module navigation, and the final checklist.
5. Use [assets/spot-form-skeleton.tsx](assets/spot-form-skeleton.tsx) as a starting template.

## Guardrails

1. Every DEX needs its own config. If one doesn't exist, contact **[@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup)** on Telegram before starting.
2. Install `@orbs-network/spot-react` and its peer dependencies (`@tanstack/react-query`, `bignumber.js`, `react-error-boundary`, `viem`, `zustand`).
3. Never import from `@orbs-network/spot-react/dist/*`. Always from `@orbs-network/spot-react`.
4. Use DEX components as-is. Don't modify them. Create new ones using DEX styles when needed.
5. Wrap objects with `useMemo`, functions with `useCallback` in SpotProvider props.
6. Verify all imports exist in the package before using them.
7. Balance refetch goes in callbacks (`onWrapSuccess`, `onOrdersProgressUpdate`), not as a prop.
8. Input amount reset goes in the modal's `onClose` callback when `status` is truthy, after calling `onSwapSuccess()`.
9. All panel data comes from `useSpot()`. Do not import individual panel hooks — they are internal.

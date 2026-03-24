---
name: spot-react-integration
description: Integration guide for @orbs-network/spot-react into a DEX frontend. Covers SpotProvider setup, hook-driven panels (TWAP, Limit, Stop-Loss, Take-Profit), order submission, order history, and DEX-native styling. Produces a fully functional advanced orders UI that matches the host DEX look and feel.
---

# Spot React Integration

Use this skill to integrate `@orbs-network/spot-react` into any DEX frontend. The library provides hook-driven panels for TWAP, Limit, Stop-Loss, and Take-Profit orders. The integration wraps the DEX's existing components so the result matches the DEX look and feel.

## Distribution

This skill lives in `skills/spot-react-integration/` of the [`orbs-network/spot-ui`](https://github.com/orbs-network/spot-ui) repository, and is also available under `node_modules/@orbs-network/spot-react/.cursor/`.

## Reference Implementation

Working example: [`apps/web/components/spot/spot-form.tsx`](https://github.com/orbs-network/spot-ui/blob/master/apps/web/components/spot/spot-form.tsx)

## Workflow

1. Read [references/01-quickstart.md](references/01-quickstart.md) for install, pre-checks, and the minimum integration steps.
2. Read [references/02-provider.md](references/02-provider.md) for SpotProvider props, component wrappers, useToken hook, and memoization rules.
3. Read [references/03-panels.md](references/03-panels.md) for hook-driven panel patterns: price, duration, trades, fill delay, submit, and order history.
4. Read [references/04-principles.md](references/04-principles.md) for integration principles, layout rules, and the final checklist.
5. Use [assets/spot-form-skeleton.tsx](assets/spot-form-skeleton.tsx) as a starting template.

## Guardrails

1. Every DEX needs its own config. If one doesn't exist, contact **[@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup)** on Telegram before starting.
2. Only install `@orbs-network/spot-react`. No other packages.
2. Never import from `@orbs-network/spot-react/dist/*`. Always from `@orbs-network/spot-react`.
3. Use DEX components as-is. Don't modify them. Create new ones using DEX styles when needed.
4. Wrap objects with `useMemo`, functions with `useCallback` in SpotProvider props.
5. Every panel displays `label` + `tooltip` from its hook.
6. Verify all imports exist in the package before using them.

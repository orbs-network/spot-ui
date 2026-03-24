# Quickstart

## Install

Always install the latest version:
```bash
npm install @orbs-network/spot-react@latest
```

If migrating from the old TWAP library:
```bash
npm uninstall @orbs-network/twap-ui && npm install @orbs-network/spot-react@latest
```

Verify `@orbs-network/spot-react` appears in `package.json` dependencies.

## DEX Configuration

Every DEX requires its own on-chain configuration (partner name, adapter address, supported chains). If the DEX does not already have a config, contact the Orbs team via the Telegram support group **[@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup)** to get one created before starting the integration.

## Pre-Integration Checklist

**Before writing code:**
- [ ] DEX has a Spot config (contact [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup) if not)
- [ ] DEX components you plan to use actually exist (search codebase)
- [ ] If a component doesn't exist (e.g. Select, Switch), plan to create one using DEX styles

**After writing code:**
- [ ] All spot-react imports exist (check package exports)
- [ ] TypeScript types match between DEX and spot-react
- [ ] Components passed to SpotProvider use correct props (`ButtonProps`, `TooltipProps`, `TokenLogoProps`)
- [ ] Objects passed to SpotProvider are wrapped in `useMemo`; functions in `useCallback`

## Minimum Steps

1. Install `@orbs-network/spot-react@latest`.
2. Create component wrappers for Button, Tooltip, TokenLogo, Spinner (see [02-provider.md](02-provider.md)).
3. Create the `useToken` hook that returns `{ address, symbol, decimals, logoUrl }` (see [02-provider.md](02-provider.md)).
4. Mount `SpotProvider` with all required props (see [02-provider.md](02-provider.md)).
5. Build the form using hook-driven panels (see [03-panels.md](03-panels.md)).
6. Place Spot tabs alongside the Swap tab in the same container.
7. Review the checklist in [04-principles.md](04-principles.md).

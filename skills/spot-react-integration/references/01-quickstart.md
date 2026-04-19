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

### Peer Dependencies

The host app must also have these installed:

| Package                | Version    |
| ---------------------- | ---------- |
| `@tanstack/react-query`| `^5.90.12` |
| `bignumber.js`         | `^9.3.1`   |
| `react-error-boundary` | `^6.0.0`   |
| `viem`                 | `^2.43.3`  |
| `zustand`              | `^5.0.9`   |
| `react`                | `^18 \|\| ^19` |
| `react-dom`            | `^18 \|\| ^19` |

## DEX Configuration

Every DEX requires its own on-chain configuration (partner name, adapter address, supported chains). If the DEX does not already have a config, contact the Orbs team via the Telegram support group **[@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup)** to get one created before starting the integration.

## Pre-Integration Checklist

**Before writing code:**
- [ ] DEX has a Spot config (contact [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup) if not)
- [ ] DEX components you plan to use actually exist (search codebase)
- [ ] If a component doesn't exist (e.g. Select, Switch), plan to create one using DEX styles
- [ ] All peer dependencies are installed

**After writing code:**
- [ ] All spot-react imports exist (check package exports)
- [ ] TypeScript types match between DEX and spot-react
- [ ] Objects passed to SpotProvider are wrapped in `useMemo`; functions in `useCallback`

## Minimum Steps

1. Install `@orbs-network/spot-react@latest` and peer dependencies.
2. Mount `SpotProvider` with all required props (see [02-provider.md](02-provider.md)).
3. Build the form using `useSpot()` hook panels (see [03-panels.md](03-panels.md)).
4. Place Spot tabs alongside the Swap tab in the same container.
5. Review the checklist in [04-principles.md](04-principles.md).

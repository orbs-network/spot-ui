# Quickstart

## Install

Always install the latest version with the host DEX's package manager. Do not mix lockfiles.
```bash
npm install @orbs-network/spot-react@latest
# or: pnpm add @orbs-network/spot-react@latest
# or: yarn add @orbs-network/spot-react@latest
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
| `zustand`              | `^5.0.9`   |
| `react`                | `^18 \|\| ^19` |
| `react-dom`            | `^18 \|\| ^19` |

Note: `viem` is **not** required. The DEX provides wallet interactions via the `walletInteractions` prop using whatever wallet library it already uses.

## DEX Configuration

Every DEX requires its own on-chain configuration (partner name, adapter address, supported chains). If the DEX does not already have a config, contact the Orbs team via the Telegram support group **[@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup)** to get one created before starting the integration.

## Pre-Integration Checklist

**Before writing code:**
- [ ] DEX has a Spot config (contact [@dTWAPSupportGroup](https://t.me/dTWAPSupportGroup) if not)
- [ ] DEX partner enum exists in `Partners`; if not, get a package/config update before integrating
- [ ] DEX components you plan to use actually exist (search codebase)
- [ ] DEX swap form state source is identified (selected tokens, typed amount, balances, USD values, quote output, quote input amount)
- [ ] Connected account/wallet hook for `chainId` and address is identified and can drive connect/switch-network UI
- [ ] Balance hooks can provide raw integer balance strings for both selected tokens
- [ ] USD price hooks can provide the USD value of exactly one source token and one destination token, or enough data to derive those values
- [ ] Quote hook exposes the output raw amount and, ideally, the input amount used to produce that quote so stale quotes can be detected
- [ ] Token selector can be reused without allowing chain switching, or a small Spot-only option can be added to hide the chain selector
- [ ] If a component doesn't exist (e.g. Select, Switch), plan to create one using DEX styles
- [ ] All peer dependencies are installed

**After writing code:**
- [ ] All spot-react imports exist (check package exports)
- [ ] No imports use `@orbs-network/spot-react/dist/*` or package-internal source paths
- [ ] TypeScript types match between DEX and spot-react
- [ ] Objects passed to SpotProvider are wrapped in `useMemo`; functions in `useCallback`
- [ ] Values that children can read from hooks are not passed through props
- [ ] Raw Spot amounts are converted into the DEX's native amount type before display when possible
- [ ] `walletInteractions` implements all 5 methods and waits for receipts on write transactions
- [ ] Lifecycle callbacks cover balance refetch for wrap, order creation, fills/progress, and cancellation
- [ ] The submit area renders connect-wallet/switch-network controls when account or connected chain is missing/unsupported
- [ ] The order history UI can handle many orders without forcing a huge modal or storing stale selected order objects

## Minimum Steps

1. Install `@orbs-network/spot-react@latest` and peer dependencies.
2. Implement the required `walletInteractions` adapter using the DEX's existing wallet library.
3. Identify the DEX source of truth for selected tokens, typed amount, balances, quote output, and USD prices.
4. Add a small DEX-owned Spot swap-state adapter/context if multiple Spot components need those values.
5. Mount `SpotProvider` with all required props passed directly (see [02-provider.md](02-provider.md)).
6. Build the form using `useSpot()` hook panels (see [03-panels.md](03-panels.md)).
7. Place Spot tabs alongside the Swap tab in the same container.
8. Add order history and cancellation inside `SpotProvider` scope or through a context-preserving portal.
9. Review the checklist in [04-principles.md](04-principles.md).

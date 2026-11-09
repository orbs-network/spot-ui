# `@orbs-network/liquidity-hub-sdk` (deprecated)

**Use [`@orbs-network/spot-ui`](../spot-ui/README.md) for all new swap integrations and migrate existing Liquidity Hub integrations to it.**

The Liquidity Hub SDK remains in this workspace for compatibility with existing integrations. Its implementation and exports are retained, but its APIs are marked deprecated in TypeScript. Deprecation does not disable existing integrations.

## Migrate to Spot

Install the framework-neutral SDK:

```bash
npm install @orbs-network/spot-ui
```

Follow the [migration guide](../spot-ui/README.md#migrating-from-liquidity-hub) and the complete [typed swap example](../spot-ui/examples/swap.ts). Spot swaps use a quote plus a single limit order; this requires changes to approval, signing, submission, and settlement tracking rather than just changing the package import.

React applications can import the same public client APIs from
[`@orbs-network/spot-react`](../spot-react/README.md) and run swaps without a
provider. `AdvancedOrdersProvider` supports advanced orders only; optional
`swap-ui` components can render the host-owned swap review/progress state.

The archived [Liquidity Hub references](../../skills/liquidity-hub-integration/SKILL.md) are available for maintaining an existing deployment during migration.

## npm registry deprecation

Repository metadata and TypeScript annotations do not update already published npm releases. A package maintainer can mark all existing releases deprecated without publishing a new version:

```bash
npm login
pnpm deprecate:liquidity-hub-sdk
```

This sets an npm installation warning directing consumers to Spot. It does not unpublish releases. Rerun it after any future legacy maintenance release.

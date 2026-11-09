# Spot Monorepo

A monorepo containing the Spot SDK, UI components, and a demo web application.

## Integrate with an AI coding agent

Describe the feature you want, for example:

> Add Spot limit orders and TWAP to this app. Discover its existing wallet,
> trading state, networks, and components. Follow the matching Spot integration
> skill, reuse the app's styling, and verify the result. Ask me only about product
> decisions you cannot infer from the project.

The agent should choose the [framework-neutral guide](skills/spot-integration/SKILL.md)
for an existing swap router or custom TypeScript integration, or the
[React guide](skills/spot-react-integration/SKILL.md) for provider-driven order forms.
Both guides include a starting path for a new or non-DEX app: create missing
wallet, token-list, balance, quote/price, and UI services before wiring Spot.
Each SDK build also bundles its matching guide at `dist/integration-skill/SKILL.md`,
with the package version recorded in `dist/integration-skill/manifest.json`.

## Packages

| Package | Description | Published |
|---------|-------------|-----------|
| [`@orbs-network/spot-ui`](packages/spot-ui/README.md) | Quotes, form calculations, signing payloads, submission, and order status (framework-agnostic) | ✅ npm |
| `@orbs-network/spot-react` | Advanced-order React provider/hooks and provider-free SDK swap APIs | ✅ npm |
| [`@orbs-network/liquidity-hub-sdk`](packages/liquidity-hub-ui/README.md) | Deprecated; migrate to `@orbs-network/spot-ui` | ✅ npm (legacy) |
| `web` | Next.js app integrating spot-react (AdvancedOrdersProvider, SpotForm, orders) | ❌ Private |

## Getting Started
### Prerequisites



- Node.js 18+
- pnpm 9+

### Installation

```bash
pnpm install
```

### Development

Build all packages:

```bash
pnpm build
```

Run the web app for local testing:

```bash
pnpm dev
```

### Building Individual Packages

```bash
pnpm build:spot-ui     # Build the framework-neutral SDK
pnpm build:spot-react  # Build the React provider and hooks
```

## DEX route adapters

Use `@orbs-network/spot-ui` directly to add Spot as a candidate in an existing DEX
quote competition. React integrations that already install `@orbs-network/spot-react`
can import all the same SDK functions and types from it, without separately
installing `spot-ui`. No React provider is required for these functions. `getQuote` carries request
identity and the authoritative `minimumAmountOut`, and
`client.prepareSwap` reuses quotes up to 20 seconds old, or refreshes
the original request and checks its minimum, before preparing raw amounts without a UI form. The DEX can
keep its wrapping, approval, and signing flow, then post the signed order with
`client.submitSignedSwap(prepared, signature)`, which waits internally for the swap to fill.
Use `client.executeSwap({ quote, account, walletInteractions })` for the default
SDK-coordinated flow. It checks allowance, approves, prepares, signs, and submits through the
host wallet callbacks, then waits for the fill. For calculated forms,
`client.executeOrder` prepares from the reviewed form's amounts and minimum;
use `client.executeSwap` when quote-age refresh is needed.
Swap forms resolve after a fill; advanced orders resolve at acceptance. Separate preparation and signed
submission remain available for DEX integrations that own those steps.
Call `await client.prepareSwap({ quote, account, signal })` immediately before signing. All swaps
have a fixed 3-minute expiration from preparation, including calculated form swaps.

See the [typed router adapter](packages/spot-ui/examples/router-swap.ts) and
[SDK guide](packages/spot-ui/README.md#existing-dex-routers-use-the-sdk-directly).

## Quote-based swaps

The demo Swap tab uses Spot orders. `getQuote` imported from `@orbs-network/spot-react`
posts `{ inToken, inAmount, outToken, user, slippage, outAmount }` to the order-sink v2 `/quote`
endpoint with `chainId` and `partner` query parameters.
UI and SDK slippage use percentages (`0.5` means 0.5%); the SDK converts to
integer basis points for the API (`50`), rounded to the nearest bps.
`dexMinAmountOut` maps to `outAmount`
and defaults to `"-1"` when no DEX quote is available. The caller's abort signal
is forwarded to fetch.

Swaps use the public Spot client directly, without a React provider. Preserve the
original quote and pass it to `client.executeSwap({ quote, account,
walletInteractions, signal })`, or use `prepareSwap` → host signing →
`submitSignedSwap` when the DEX owns wallet steps. Keep the existing swap form,
review/modal state, and optional `swap-ui` presentation.

`quote.minimumAmountOut` is authoritative and already includes UI slippage; do
not apply slippage again. Protocol input uses the configured wrapped ERC-20
address for a native selection. SDK-managed execution awaits the host's required
`shouldWrap()` decision and confirms `wrapNativeToken` when true. Manual wallet
flows complete wrapping and approval before preparation/signing.

The SDK waits internally for a confirmed fill. Keep host loading/duplicate guards
active until the client promise completes, pause obsolete quote requests during
execution, and preserve `OrderSettlementError.order`/`orderId` for read-only
recovery. No provider hooks or second settlement poller are needed. Swaps have a
fixed three-minute signed expiration and fixed 500 bps oracle protection.

`AdvancedOrdersProvider` supports only TWAP, Limit, Stop-Loss, and Take-Profit
forms. It can coexist with the independent swap flow in the same application.
Its `marketQuote` accepts current advanced-order valuation, including optional
SDK quotes; a quote object does not imply swap execution.

## Migrating from Liquidity Hub

`@orbs-network/liquidity-hub-sdk` is deprecated. Use the framework-neutral
`@orbs-network/spot-ui` SDK for new swap integrations and migrate existing
Liquidity Hub integrations to it:

```bash
npm install @orbs-network/spot-ui
```

Follow the [migration guide](packages/spot-ui/README.md#migrating-from-liquidity-hub)
and [typed swap example](packages/spot-ui/examples/swap.ts). Spot swaps use a quote
plus a limit order, with configured approvals, fresh order signing, submission,
and order-ID settlement tracking.

React applications can install only `@orbs-network/spot-react`, which includes and
re-exports the SDK, and call its client APIs for swaps without a provider. Use
`AdvancedOrdersProvider` only for advanced-order forms. The legacy Liquidity Hub package remains available for
compatibility during migration.

## Publishing to npm

Publish each package with its repository script. After confirming the release
version, the scripts check npm authentication and open `npm login --auth-type=web`
when credentials are missing or expired. Existing authenticated sessions are reused.
After login is verified, they build the relevant packages and request an OTP:

```bash
pnpm publish:spot-ui
pnpm publish:spot-react
```

To release both in order, run:

```bash
pnpm publish:spot
```

This publishes `spot-ui` first, then starts the React publisher. Both packages
keep their usual version and OTP prompts. Cancelling or failing the SDK release
stops the sequence.

Authentication, dependency checks, and publishing use the same registry, selected
from the package scope's registry, `publishConfig.registry`, or the default registry.
The login check uses the same package or workspace `.npmrc` as `pnpm publish`.
Login cancellation or authentication failure stops before changing the manifest.
Without an interactive terminal, missing credentials produce login/token setup
instructions. Connection failures stop without opening a login prompt.

Publish `spot-ui` first when releasing a new SDK version alongside `spot-react`.
The React publisher polls for the exact local SDK version every five seconds
for up to five minutes before building or publishing, because `workspace:*`
becomes an exact version in the published package. Each lookup checks the registry
online. This also applies to standalone `publish:spot-react` runs. A timeout or
registry authentication failure stops the React release and keeps the already
published SDK version. After resolving the issue, retry `pnpm publish:spot-react`.

Build failures and cancellation at the OTP prompt restore the
original package manifest. Once the publish command starts, failures retain
the selected version because the registry may already have accepted the upload;
check npm before retrying.

To mark all existing Liquidity Hub releases deprecated on npm, sign in as a
package maintainer and run `pnpm deprecate:liquidity-hub-sdk`. This updates the
registry's installation warning without unpublishing releases. The legacy
publisher remains available for maintenance releases.

## Skills

| Skill | Description |
|-------|-------------|
| [`spot-integration`](skills/spot-integration/SKILL.md) | Integrating framework-neutral `@orbs-network/spot-ui` into an existing TypeScript app. Reuses the app's components and optimized state layer for form calculation, execution, history, and cancellation. |
| [`spot-react-integration`](skills/spot-react-integration/SKILL.md) | Integrating `@orbs-network/spot-react` into a DEX frontend. Covers AdvancedOrdersProvider setup, hook-driven panels, order submission, and DEX-native styling. |
| [`liquidity-hub-integration`](skills/liquidity-hub-integration/SKILL.md) | Migration from the deprecated Liquidity Hub SDK to Spot, with archived legacy maintenance references. |

## Project Structure

```
├── apps/
│   └── web/                    # Next.js app (AdvancedOrdersProvider, SpotForm, orders)
├── packages/
│   ├── spot-ui/                # @orbs-network/spot-ui (order config fetch, build, submit)
│   ├── spot-react/             # @orbs-network/spot-react (context, hooks, components)
│   └── liquidity-hub-ui/      # Deprecated @orbs-network/liquidity-hub-sdk
├── skills/
│   ├── liquidity-hub-integration/ # Liquidity Hub migration and legacy maintenance
│   ├── spot-integration/           # Framework-neutral TypeScript integration skill
│   └── spot-react-integration/     # React integration skill
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

## Package Dependencies

```
web
 └── spot-react (AdvancedOrdersProvider and focused React hooks)
      └── spot-ui (client initialization, order preparation, submission, history)
```

## Order Signatures

`walletInteractions.signOrder` must return the wallet's original `0x`-prefixed EIP-712 signature. `spot-react` forwards that value unchanged to `spot-ui` and the order submission request. Do not split the signature into `{ v, r, s }`, rewrite `v`, or normalize its byte representation.

## RePermit Configuration

`@orbs-network/spot-react` initializes a `@orbs-network/spot-ui` client as soon as
the `partner` and `chainId` are available. Client and history state are scoped to
each `AdvancedOrdersProvider`; no host query provider is required. The framework-neutral
`createClient(partner, chainId)` factory returns a new client while sharing
validated configuration requests/templates through a 60-second, 32-entry LRU
cache. Each client receives a deep copy, failed requests are evicted, and nonce
allocation is shared within the loaded SDK instance. Hosts still own client
resource lifetime and invalidation.

The client owns the configuration-derived spender, exchange, signing payload, approval/cancellation requests, submission, and configured order history. Pure calculations remain package-level functions. The `calculateOrder` helper accepts raw DEX form state and produces defaults, prices, trades, schedules, validation, raw/token-formatted/USD values, and the execution values shared by order construction and React displays. Form calculation is time-independent; `prepareOrder` assigns the exact start and deadline immediately before signing. A missing client represents initialization loading; after automatic retries, `AdvancedOrdersProvider` keeps the host form mounted and renders a retryable, host-customizable `clientErrorFallback` alongside it.

The client rejects configurations whose domain or order chain differs from the requested chain, and rejects malformed or zero RePermit and exchange-adapter addresses. `domain.verifyingContract` is used as the ERC-20 approval spender and v2 cancellation contract; the returned adapter, reactor, and executor are used for v2 orders. The endpoint remains security-critical because the SDK does not independently verify deployed bytecode or contract identity, so it must be served by the trusted Orbs service over TLS.

## License

MIT

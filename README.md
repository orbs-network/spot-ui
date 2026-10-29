# Spot Monorepo

A monorepo containing the Spot SDK, UI components, and a demo web application.

## Packages

| Package | Description | Published |
|---------|-------------|-----------|
| [`@orbs-network/spot-ui`](packages/spot-ui/README.md) | Quotes, form calculations, signing payloads, submission, and order status (framework-agnostic) | ✅ npm |
| `@orbs-network/spot-react` | Headless React provider and hooks consuming spot-ui | ✅ npm |
| [`@orbs-network/liquidity-hub-sdk`](packages/liquidity-hub-ui/README.md) | Deprecated; migrate to `@orbs-network/spot-ui` | ✅ npm (legacy) |
| `web` | Next.js app integrating spot-react (SpotProvider, SpotForm, orders) | ❌ Private |

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
`client.prepareSwap` builds from raw amounts without a UI form. The DEX can
keep its wrapping, approval, and signing flow, then post the signed order with
`client.submitOrder`. Use `waitForOrder({ order })` for settlement tracking; the
order contains its ID, chain, and deadline, so tracking needs no client.
`submitSwap` remains optional for integrations wanting SDK wallet orchestration.
Call `client.prepareSwap(quote, account)` immediately before signing. All swaps
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

For `Module.SWAP`, pass the quote's `netAmountOut` as
`quotedOutputAmountRaw` and its `minimumAmountOut` unchanged as
`minimumOutputAmountRaw`. In React, provide both through
`SpotProvider.marketQuote`. Missing or invalid amounts block submission.
Do not apply slippage again to the returned minimum.
The form creates one limit order with that exact minimum and a
fixed 3-minute expiration. Native input is wrapped before approval; signing,
submission, history, and cancellation use the existing Spot flow.
The demo pauses quote requests during execution, including settlement, and
resumes quoting after execution finishes.
The Swap panel polls only the submitted order ID (`/orders?hash=...`) every two
seconds and shows success only after that order is filled. Its polling updates
only that order in the local cache and is independent of account-history polling.
Expired or cancelled orders show an error. Temporary lookup failures are retried;
if confirmation remains unavailable past the order
deadline and indexing grace period, the user is directed to check order history.
Swap orders always sign `witness.slippage` as `500` (5%). Send the UI slippage
setting in the quote request and use the returned `quote.minimumAmountOut` unchanged.

The demo calls the order-sink v2 quote API directly from the browser and refreshes
quotes every ten seconds. Token, input amount, wallet, network, partner, or slippage changes
select a new quote. Other order modules keep their existing price estimates.

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
re-exports the SDK, and use the same `SpotProvider` with `Module.SWAP`. The legacy Liquidity Hub package remains available for
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

Authentication, dependency checks, and publishing use the same registry, selected
from the package scope's registry, `publishConfig.registry`, or the default registry.
The login check uses the same package or workspace `.npmrc` as `pnpm publish`.
Login cancellation or authentication failure stops before changing the manifest.
Without an interactive terminal, missing credentials produce login/token setup
instructions. Connection failures stop without opening a login prompt.

Publish `spot-ui` first when releasing a new SDK version alongside `spot-react`.
The React publisher checks that the exact local SDK version exists in the
registry before proceeding, because `workspace:*` becomes an exact version in
the published package. A failed registry lookup stops the release.

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
| [`spot-react-integration`](skills/spot-react-integration/SKILL.md) | Integrating `@orbs-network/spot-react` into a DEX frontend. Covers SpotProvider setup, hook-driven panels, order submission, and DEX-native styling. |
| [`liquidity-hub-integration`](skills/liquidity-hub-integration/SKILL.md) | Migration from the deprecated Liquidity Hub SDK to Spot, with archived legacy maintenance references. |

## Project Structure

```
├── apps/
│   └── web/                    # Next.js app (SpotProvider, SpotForm, orders)
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
 └── spot-react (SpotProvider and focused React hooks)
      └── spot-ui (client initialization, order preparation, submission, history)
```

## Order Signatures

`walletInteractions.signOrder` must return the wallet's original `0x`-prefixed EIP-712 signature. `spot-react` forwards that value unchanged to `spot-ui` and the order submission request. Do not split the signature into `{ v, r, s }`, rewrite `v`, or normalize its byte representation.

## RePermit Configuration

`@orbs-network/spot-react` initializes a `@orbs-network/spot-ui` client as soon as
the `partner` and `chainId` are available. Client and history state are scoped to
each `SpotProvider`; no host query provider is required. The framework-neutral
`createClient(partner, chainId)` factory returns a new client while sharing
validated configuration requests/templates through a 60-second, 32-entry LRU
cache. Each client receives a deep copy, failed requests are evicted, and nonce
allocation is shared within the loaded SDK instance. Hosts still own client
resource lifetime and invalidation.

The client owns the configuration-derived spender, exchange, signing payload, approval/cancellation requests, submission, and configured order history. Pure calculations remain package-level functions. The `calculateOrder` helper accepts raw DEX form state and produces defaults, prices, trades, schedules, validation, raw/token-formatted/USD values, and the execution values shared by order construction and React displays. Form calculation is time-independent; `prepareOrder` assigns the exact start and deadline immediately before signing. A missing client represents initialization loading; after automatic retries, `SpotProvider` keeps the host form mounted and renders a retryable, host-customizable `clientErrorFallback` alongside it.

The client rejects configurations whose domain or order chain differs from the requested chain, and rejects malformed or zero RePermit and exchange-adapter addresses. `domain.verifyingContract` is used as the ERC-20 approval spender and v2 cancellation contract; the returned adapter, reactor, and executor are used for v2 orders. The endpoint remains security-critical because the SDK does not independently verify deployed bytecode or contract identity, so it must be served by the trusted Orbs service over TLS.

## License

MIT
